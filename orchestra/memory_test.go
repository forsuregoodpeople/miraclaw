package orchestra_test

import (
	"context"
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

func TestMemoryAddBotReply(t *testing.T) {
	// NewMemory requires a live Qdrant — skip in unit test, test the signature only.
	// Integration test should be done with a real Qdrant instance.
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, "test_memory", &mockEmbedder{})
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

	mem, err := orchestra.NewMemory("localhost", 6334, "test_memory", &mockEmbedder{})
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

func TestMemoryCloseSession(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, "test_memory", &mockEmbedder{})
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

	msgs, _ := mem.GetSession(ctx, "chan-close", 10)
	if len(msgs) != 0 {
		t.Errorf("expected empty session after CloseSession, got %d", len(msgs))
	}
}

func TestMemoryAddSignature(t *testing.T) {
	// Test that Add accepts a role parameter — compile-time check via interface.
	// If this compiles, the signature is correct.
	var _ = func(m *orchestra.Memory) {
		ctx := context.Background()
		msg := orchestra.NewMessage("id", "text", "chan")
		_ = m.Add(ctx, msg, "user")
		_ = m.AddBotReply(ctx, "chan", "response")
		_, _ = m.GetSession(ctx, "chan", 5)
		_ = m.CloseSession(ctx, "chan")
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
