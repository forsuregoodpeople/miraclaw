package orchestra

import (
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"os/exec"
	"sort"
	"time"

	qclient "github.com/qdrant/go-client/qdrant"
)

type textCodec interface {
	Encrypt(string) (string, error)
	Decrypt(string) (string, error)
}

type MemoryCollections struct {
	Session   string
	ShortTerm string
	LongTerm  string
	Static    string
}

type Memory struct {
	client      *qclient.Client
	collections MemoryCollections
	embedder    Embedder
	enc         textCodec
}

func (m *Memory) SetEncryptor(enc textCodec) {
	m.enc = enc
}

func NewMemory(host string, port int, cols MemoryCollections, embedder Embedder) (*Memory, error) {
	client, err := qclient.NewClient(&qclient.Config{
		Host:                   host,
		Port:                   port,
		SkipCompatibilityCheck: true,
	})
	if err != nil {
		return nil, fmt.Errorf("qdrant connect: %w", err)
	}

	if err := waitReady(client); err != nil {
		log.Println("qdrant not ready, trying systemctl start qdrant...")
		if startErr := exec.Command("systemctl", "start", "qdrant").Run(); startErr != nil {
			return nil, fmt.Errorf("qdrant unavailable and systemctl start failed: %w", startErr)
		}
		if err := waitReady(client); err != nil {
			return nil, fmt.Errorf("qdrant still not ready after systemctl start: %w", err)
		}
	}

	mem := &Memory{client: client, collections: cols, embedder: embedder}
	ctx := context.Background()
	for _, col := range []string{cols.Session, cols.ShortTerm, cols.LongTerm, cols.Static} {
		if err := mem.ensureCollection(ctx, col); err != nil {
			return nil, fmt.Errorf("ensure collection %q: %w", col, err)
		}
	}
	return mem, nil
}

func waitReady(client *qclient.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for {
		_, err := client.HealthCheck(ctx)
		if err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting for qdrant")
		case <-time.After(2 * time.Second):
		}
	}
}

func (m *Memory) ensureCollection(ctx context.Context, name string) error {
	exists, err := m.client.CollectionExists(ctx, name)
	if err != nil {
		return fmt.Errorf("check collection: %w", err)
	}
	if exists {
		info, err := m.client.GetCollectionInfo(ctx, name)
		if err != nil {
			return fmt.Errorf("get collection info: %w", err)
		}
		if info.GetConfig().GetParams().GetVectorsConfig().GetParams().GetSize() != m.embedder.Dimensions() {
			log.Printf("warn: collection %q has wrong vector size, recreating...", name)
			if err := m.client.DeleteCollection(ctx, name); err != nil {
				return fmt.Errorf("delete collection: %w", err)
			}
		} else {
			return nil
		}
	}
	return m.client.CreateCollection(ctx, &qclient.CreateCollection{
		CollectionName: name,
		VectorsConfig: qclient.NewVectorsConfig(&qclient.VectorParams{
			Size:     m.embedder.Dimensions(),
			Distance: qclient.Distance_Cosine,
		}),
	})
}

func (m *Memory) upsertPoint(ctx context.Context, collection string, msg *Message, role string) error {
	vec, err := m.embedder.Embed(ctx, msg.Text)
	if err != nil {
		return fmt.Errorf("embed: %w", err)
	}

	storedText := msg.Text
	if m.enc != nil {
		storedText, err = m.enc.Encrypt(msg.Text)
		if err != nil {
			return fmt.Errorf("encrypt: %w", err)
		}
	}

	_, err = m.client.Upsert(ctx, &qclient.UpsertPoints{
		CollectionName: collection,
		Points: []*qclient.PointStruct{
			{
				Id:      qclient.NewIDNum(hashID(msg.ID)),
				Vectors: qclient.NewVectors(vec...),
				Payload: qclient.NewValueMap(map[string]any{
					"id":         msg.ID,
					"text":       storedText,
					"channel_id": msg.ChannelID,
					"session_id": msg.ChannelID,
					"role":       role,
					"ts":         time.Now().UnixNano(),
				}),
			},
		},
	})
	return err
}

func (m *Memory) Add(ctx context.Context, msg *Message, role string) error {
	return m.upsertPoint(ctx, m.collections.Session, msg, role)
}

func (m *Memory) AddBotReply(ctx context.Context, channelID, text string) error {
	id := fmt.Sprintf("bot-%s-%d", channelID, time.Now().UnixNano())
	msg := NewMessage(id, text, channelID)
	return m.Add(ctx, msg, "assistant")
}

func (m *Memory) AddStatic(ctx context.Context, id, text, category string) error {
	msg := NewMessage(id, text, category)
	return m.upsertPoint(ctx, m.collections.Static, msg, "static")
}

func (m *Memory) GetSession(ctx context.Context, channelID string, limit uint64) ([]*Message, error) {
	var bigLim uint32 = 1000
	results, err := m.client.Scroll(ctx, &qclient.ScrollPoints{
		CollectionName: m.collections.Session,
		Filter: &qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("session_id", channelID),
			},
		},
		Limit:       &bigLim,
		WithPayload: qclient.NewWithPayload(true),
	})
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}

	msgs := m.parseTimestamped(results)
	if limit > 0 && uint64(len(msgs)) > limit {
		msgs = msgs[uint64(len(msgs))-limit:]
	}
	return msgs, nil
}

func (m *Memory) CloseSession(ctx context.Context, channelID string) error {
	var bigLimit uint32 = 1000
	results, err := m.client.Scroll(ctx, &qclient.ScrollPoints{
		CollectionName: m.collections.Session,
		Filter: &qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("session_id", channelID),
			},
		},
		Limit:       &bigLimit,
		WithPayload: qclient.NewWithPayload(true),
		WithVectors: qclient.NewWithVectors(true),
	})
	if err != nil {
		return fmt.Errorf("read session for close: %w", err)
	}

	if len(results) > 0 {
		var points []*qclient.PointStruct
		for _, r := range results {
			vec := vectorOutputToFloat32(r.GetVectors())
			if vec == nil {
				continue
			}
			points = append(points, &qclient.PointStruct{
				Id:      r.GetId(),
				Vectors: qclient.NewVectors(vec...),
				Payload: r.GetPayload(),
			})
		}
		if len(points) > 0 {
			if _, err := m.client.Upsert(ctx, &qclient.UpsertPoints{
				CollectionName: m.collections.ShortTerm,
				Points:         points,
			}); err != nil {
				return fmt.Errorf("promote to short-term: %w", err)
			}
		}
	}

	_, err = m.client.Delete(ctx, &qclient.DeletePoints{
		CollectionName: m.collections.Session,
		Points: qclient.NewPointsSelectorFilter(&qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("session_id", channelID),
			},
		}),
	})
	if err != nil {
		return fmt.Errorf("close session: %w", err)
	}
	return nil
}

func (m *Memory) Search(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error) {
	vec, err := m.embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	half := topN/2 + 1
	shortResults, err := m.queryCollection(ctx, m.collections.ShortTerm, vec, half, channelID)
	if err != nil {
		log.Printf("warn: search short-term failed: %v", err)
	}
	longResults, err := m.queryCollection(ctx, m.collections.LongTerm, vec, half, channelID)
	if err != nil {
		log.Printf("warn: search long-term failed: %v", err)
	}

	merged := append(shortResults, longResults...)
	if uint64(len(merged)) > topN {
		merged = merged[:topN]
	}
	return merged, nil
}

func (m *Memory) SearchStatic(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error) {
	vec, err := m.embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	return m.queryCollection(ctx, m.collections.Static, vec, topN, channelID)
}

func (m *Memory) PromoteToLongTerm(ctx context.Context, msgID string) error {
	var lim uint32 = 1
	results, err := m.client.Scroll(ctx, &qclient.ScrollPoints{
		CollectionName: m.collections.ShortTerm,
		Filter: &qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("id", msgID),
			},
		},
		Limit:       &lim,
		WithPayload: qclient.NewWithPayload(true),
		WithVectors: qclient.NewWithVectors(true),
	})
	if err != nil {
		return fmt.Errorf("find in short-term: %w", err)
	}
	if len(results) == 0 {
		return fmt.Errorf("message %q not found in short-term", msgID)
	}

	r := results[0]
	vec := vectorOutputToFloat32(r.GetVectors())
	if vec == nil {
		return fmt.Errorf("message %q has no vector data", msgID)
	}
	if _, err := m.client.Upsert(ctx, &qclient.UpsertPoints{
		CollectionName: m.collections.LongTerm,
		Points: []*qclient.PointStruct{
			{
				Id:      r.GetId(),
				Vectors: qclient.NewVectors(vec...),
				Payload: r.GetPayload(),
			},
		},
	}); err != nil {
		return fmt.Errorf("promote to long-term: %w", err)
	}
	return nil
}

func (m *Memory) queryCollection(ctx context.Context, collection string, vec []float32, topN uint64, channelID string) ([]*Message, error) {
	req := &qclient.QueryPoints{
		CollectionName: collection,
		Query:          qclient.NewQuery(vec...),
		Limit:          &topN,
		WithPayload:    qclient.NewWithPayload(true),
	}
	if channelID != "" {
		req.Filter = &qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("channel_id", channelID),
			},
		}
	}
	results, err := m.client.Query(ctx, req)
	if err != nil {
		return nil, err
	}

	msgs := make([]*Message, 0, len(results))
	for _, r := range results {
		p := r.GetPayload()
		text := p["text"].GetStringValue()
		if m.enc != nil {
			decrypted, decErr := m.enc.Decrypt(text)
			if decErr != nil {
				log.Printf("warn: memory decrypt failed: %v", decErr)
				continue
			}
			text = decrypted
		}
		msgs = append(msgs, &Message{
			ID:        p["id"].GetStringValue(),
			Text:      text,
			ChannelID: p["channel_id"].GetStringValue(),
			Role:      p["role"].GetStringValue(),
		})
	}
	return msgs, nil
}

func (m *Memory) parseTimestamped(results []*qclient.RetrievedPoint) []*Message {
	type timestamped struct {
		msg *Message
		ts  int64
	}
	var items []timestamped
	for _, r := range results {
		p := r.GetPayload()
		text := p["text"].GetStringValue()
		if m.enc != nil {
			decrypted, decErr := m.enc.Decrypt(text)
			if decErr != nil {
				log.Printf("warn: session decrypt failed: %v", decErr)
				continue
			}
			text = decrypted
		}
		items = append(items, timestamped{
			msg: &Message{
				ID:        p["id"].GetStringValue(),
				Text:      text,
				ChannelID: p["channel_id"].GetStringValue(),
				Role:      p["role"].GetStringValue(),
			},
			ts: p["ts"].GetIntegerValue(),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].ts < items[j].ts
	})

	msgs := make([]*Message, len(items))
	for i, item := range items {
		msgs[i] = item.msg
	}
	return msgs
}

func vectorOutputToFloat32(vo *qclient.VectorsOutput) []float32 {
	if vo == nil {
		return nil
	}
	if v, ok := vo.GetVectorsOptions().(*qclient.VectorsOutput_Vector); ok {
		if v.Vector != nil {
			return v.Vector.GetData()
		}
	}
	return nil
}

func hashID(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	return h.Sum64()
}
