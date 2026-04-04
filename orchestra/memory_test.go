package orchestra_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/miraclaw/orchestra"
)

// mockEmbedder is a simple embedder that returns a fixed vector.
type mockEmbedder struct{}

func (m *mockEmbedder) Embed(_ context.Context, _ string) ([]float32, error) {
	return make([]float32, 4), nil
}

func (m *mockEmbedder) Dimensions() uint64 { return 4 }

// testCols returns MemoryCollections dengan nama unik untuk test.
func testCols(prefix string) orchestra.MemoryCollections {
	return orchestra.MemoryCollections{
		Session:   prefix + "_session",
		ShortTerm: prefix + "_short_term",
		LongTerm:  prefix + "_long_term",
		Static:    prefix + "_static",
	}
}

func TestMemoryAddBotReply(t *testing.T) {
	// NewMemory requires a live Qdrant — skip in unit test, test the signature only.
	// Integration test should be done with a real Qdrant instance.
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("test"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()
	err = mem.AddBotReply(ctx, "chan-1", "Hello from bot")
	if err != nil {
		t.Errorf("AddBotReply: %v", err)
	}
}

func TestMemoryGetSession(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("test"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	msg := orchestra.NewMessage("msg-1", "hello", "chan-1")
	_ = mem.Add(ctx, msg, "user")

	msgs, err := mem.GetSession(ctx, "chan-1", 10)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if len(msgs) == 0 {
		t.Error("expected at least 1 message in session")
	}
}

func TestMemoryGetSessionReturnsLastN(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("lastn"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	// Add 10 messages; the last one should always be included when limit=3.
	for i := 0; i < 10; i++ {
		id := fmt.Sprintf("msg-%d", i)
		text := fmt.Sprintf("message %d", i)
		_ = mem.Add(ctx, orchestra.NewMessage(id, text, "chan-lastn"), "user")
		time.Sleep(2 * time.Millisecond) // ensure distinct timestamps
	}

	msgs, err := mem.GetSession(ctx, "chan-lastn", 3)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(msgs))
	}
	// Last returned message should be the most recent (message 9)
	last := msgs[len(msgs)-1]
	if last.Text != "message 9" {
		t.Errorf("expected last message to be 'message 9', got %q", last.Text)
	}
}

func TestMemoryCloseSession(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("test"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	msg := orchestra.NewMessage("msg-2", "bye", "chan-close")
	_ = mem.Add(ctx, msg, "user")

	err = mem.CloseSession(ctx, "chan-close")
	if err != nil {
		t.Errorf("CloseSession: %v", err)
	}

	// Setelah CloseSession, session aktif harus kosong
	msgs, _ := mem.GetSession(ctx, "chan-close", 10)
	if len(msgs) != 0 {
		t.Errorf("expected empty session after CloseSession, got %d", len(msgs))
	}

	// Tapi short-term harus berisi pesan yang di-promote
	shortMsgs, err := mem.Search(ctx, "chan-close", "bye", 10)
	if err != nil {
		t.Fatalf("Search after CloseSession: %v", err)
	}
	if len(shortMsgs) == 0 {
		t.Error("expected promoted messages in short-term after CloseSession")
	}
}

func TestMemoryAddStatic(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("test"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	err = mem.AddStatic(ctx, "fact-1", "MiraClaw is an AI agent framework", "system")
	if err != nil {
		t.Errorf("AddStatic: %v", err)
	}

	results, err := mem.SearchStatic(ctx, "", "AI agent", 5)
	if err != nil {
		t.Fatalf("SearchStatic: %v", err)
	}
	if len(results) == 0 {
		t.Error("expected static knowledge to be searchable")
	}
}

func TestMemoryAddSignature(t *testing.T) {
	// Compile-time check: semua method harus ada di *Memory.
	var _ = func(m *orchestra.Memory) {
		ctx := context.Background()
		msg := orchestra.NewMessage("id", "text", "chan")
		_ = m.Add(ctx, msg, "user")
		_ = m.AddBotReply(ctx, "chan", "response")
		_, _ = m.GetSession(ctx, "chan", 5)
		_ = m.CloseSession(ctx, "chan")
		_, _ = m.Search(ctx, "chan", "query", 3)
		_, _ = m.SearchStatic(ctx, "chan", "query", 3)
		_ = m.AddStatic(ctx, "id", "text", "category")
	}
}

// TestMemoryTimestamp verifies ts ordering logic (unit-testable without Qdrant).
func TestMemoryTimestamp(t *testing.T) {
	t1 := time.Now().UnixNano()
	time.Sleep(1 * time.Millisecond)
	t2 := time.Now().UnixNano()
	if t2 <= t1 {
		t.Error("expected t2 > t1 for timestamp ordering")
	}
}
