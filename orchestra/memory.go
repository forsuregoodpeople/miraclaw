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

// textCodec is a duck-typed interface to avoid a direct import of orchestra/security.
type textCodec interface {
	Encrypt(string) (string, error)
	Decrypt(string) (string, error)
}

type Memory struct {
	client     *qclient.Client
	collection string
	embedder   Embedder
	enc        textCodec // optional; nil means plaintext storage
}

// SetEncryptor attaches an encryptor for at-rest text encryption.
// Must be called before any Add/Search operations.
func (m *Memory) SetEncryptor(enc textCodec) {
	m.enc = enc
}

func NewMemory(host string, port int, collection string, embedder Embedder) (*Memory, error) {
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

	mem := &Memory{client: client, collection: collection, embedder: embedder}
	if err := mem.ensureCollection(context.Background()); err != nil {
		return nil, err
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

func (m *Memory) ensureCollection(ctx context.Context) error {
	exists, err := m.client.CollectionExists(ctx, m.collection)
	if err != nil {
		return fmt.Errorf("check collection: %w", err)
	}
	if exists {
		info, err := m.client.GetCollectionInfo(ctx, m.collection)
		if err != nil {
			return fmt.Errorf("get collection info: %w", err)
		}
		if info.GetConfig().GetParams().GetVectorsConfig().GetParams().GetSize() != m.embedder.Dimensions() {
			log.Printf("warn: collection %q has wrong vector size, recreating...", m.collection)
			if err := m.client.DeleteCollection(ctx, m.collection); err != nil {
				return fmt.Errorf("delete collection: %w", err)
			}
		} else {
			return nil
		}
	}
	return m.client.CreateCollection(ctx, &qclient.CreateCollection{
		CollectionName: m.collection,
		VectorsConfig: qclient.NewVectorsConfig(&qclient.VectorParams{
			Size:     m.embedder.Dimensions(),
			Distance: qclient.Distance_Cosine,
		}),
	})
}

// Add embeds and stores a message with role and session metadata.
// role should be "user" or "assistant".
func (m *Memory) Add(ctx context.Context, msg *Message, role string) error {
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
		CollectionName: m.collection,
		Points: []*qclient.PointStruct{
			{
				Id:      qclient.NewIDNum(hashID(msg.ID)),
				Vectors: qclient.NewVectors(vec...),
				Payload: qclient.NewValueMap(map[string]any{
					"id":         msg.ID,
					"text":       storedText,
					"channel_id": msg.ChannelID,
					"session_id": msg.ChannelID, // session_id == channel_id while session active
					"role":       role,
					"ts":         time.Now().UnixNano(),
				}),
			},
		},
	})
	return err
}

// AddBotReply stores a bot response message under the given channelID.
func (m *Memory) AddBotReply(ctx context.Context, channelID, text string) error {
	id := fmt.Sprintf("bot-%s-%d", channelID, time.Now().UnixNano())
	msg := NewMessage(id, text, channelID)
	return m.Add(ctx, msg, "assistant")
}

// GetSession returns the N most recent messages for the active session (channelID).
// Results are ordered by timestamp ascending (oldest first).
func (m *Memory) GetSession(ctx context.Context, channelID string, limit uint64) ([]*Message, error) {
	lim := uint32(limit)
	results, err := m.client.Scroll(ctx, &qclient.ScrollPoints{
		CollectionName: m.collection,
		Filter: &qclient.Filter{
			Must: []*qclient.Condition{
				qclient.NewMatch("session_id", channelID),
			},
		},
		Limit:       &lim,
		WithPayload: qclient.NewWithPayload(true),
	})
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}

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
	return msgs, nil
}

// CloseSession deletes all points tagged with session_id == channelID.
// Call this when a session ends to free Qdrant space while preserving long-term memory.
func (m *Memory) CloseSession(ctx context.Context, channelID string) error {
	_, err := m.client.Delete(ctx, &qclient.DeletePoints{
		CollectionName: m.collection,
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

// Search performs a semantic similarity search, returning the top-N relevant messages
// across all channels (long-term memory, no session filter).
func (m *Memory) Search(ctx context.Context, query string, topN uint64) ([]*Message, error) {
	vec, err := m.embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	results, err := m.client.Query(ctx, &qclient.QueryPoints{
		CollectionName: m.collection,
		Query:          qclient.NewQuery(vec...),
		Limit:          &topN,
		WithPayload:    qclient.NewWithPayload(true),
	})
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
		})
	}
	return msgs, nil
}

func hashID(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	return h.Sum64()
}
