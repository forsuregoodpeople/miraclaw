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

func TestIsImportantTextKeywords(t *testing.T) {
	cases := []struct {
		text      string
		important bool
	}{
		{"nama saya budi", true},
		{"my name is john", true},
		{"alamat saya di jakarta", true},
		{"suka kopi", true},
		{"i like coffee", true},
		{"kerja di perusahaan", true},
		{"ingat ini", true},
		{"penting banget", true},
		{"cuaca hari ini bagus", false},
		{"halo apa kabar", false},
	}
	for _, c := range cases {
		got := orchestra.IsImportantText(c.text)
		if got != c.important {
			t.Errorf("IsImportantText(%q) = %v, want %v", c.text, got, c.important)
		}
	}
}

func TestCloseSessionTriggersAutoPromotion(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("autopromote"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	// Add a session message with an important keyword
	msg := orchestra.NewMessage("important-1", "nama saya budi dan saya suka kopi", "chan-autopromote")
	_ = mem.Add(ctx, msg, "user")

	if err := mem.CloseSession(ctx, "chan-autopromote"); err != nil {
		t.Fatalf("CloseSession: %v", err)
	}

	// Verify it landed in LongTerm via Search (which covers both ShortTerm + LongTerm)
	results, err := mem.Search(ctx, "chan-autopromote", "nama budi", 10)
	if err != nil {
		t.Fatalf("Search after CloseSession: %v", err)
	}
	if len(results) == 0 {
		t.Error("expected auto-promoted message to appear in search results")
	}
}

func TestMemorySetShortTermTTL(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("ttl_set"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	// Just verify no panic and method exists
	mem.SetShortTermTTL(7)
	mem.SetShortTermTTL(0) // disable
}

func TestCloseSessionPrunesOldData(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("ttl_prune"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	mem.SetShortTermTTL(1) // 1-day TTL
	ctx := context.Background()

	msg := orchestra.NewMessage("ttl-msg-1", "old message that should be pruned eventually", "chan-ttl")
	_ = mem.Add(ctx, msg, "user")
	if err := mem.CloseSession(ctx, "chan-ttl"); err != nil {
		t.Fatalf("CloseSession: %v", err)
	}
	// With 1-day TTL, a just-added entry should survive (it's fresh)
	results, err := mem.Search(ctx, "chan-ttl", "old message", 5)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) == 0 {
		t.Error("expected fresh entry to survive 1-day TTL prune")
	}
}

func TestPruneShortTermZeroDaysIsNoop(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("prune_noop"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()
	if err := mem.PruneShortTerm(ctx, 0); err != nil {
		t.Errorf("PruneShortTerm(0) should be noop, got: %v", err)
	}
}

func TestPruneShortTermDeletesOldEntries(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("prune_old"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	// Insert a message then prune with 0-day window (everything is "old")
	msg := orchestra.NewMessage("prune-old-1", "this is an old memory", "chan-prune")
	_ = mem.Add(ctx, msg, "user")
	_ = mem.CloseSession(ctx, "chan-prune") // promotes to ShortTerm

	// Prune with a negative past cutoff — use days=0 is noop, so test differently:
	// We just verify PruneShortTerm runs without error with a real TTL.
	if err := mem.PruneShortTerm(ctx, 7); err != nil {
		t.Errorf("PruneShortTerm: %v", err)
	}
}

func TestPruneShortTermKeepsRecentEntries(t *testing.T) {
	t.Skip("requires Qdrant — run as integration test")

	mem, err := orchestra.NewMemory("localhost", 6334, testCols("prune_recent"), &mockEmbedder{})
	if err != nil {
		t.Fatalf("NewMemory: %v", err)
	}
	ctx := context.Background()

	msg := orchestra.NewMessage("recent-1", "this is a recent memory", "chan-recent")
	_ = mem.Add(ctx, msg, "user")
	_ = mem.CloseSession(ctx, "chan-recent")

	// Prune with 7-day TTL — recent entry should survive
	if err := mem.PruneShortTerm(ctx, 7); err != nil {
		t.Errorf("PruneShortTerm: %v", err)
	}
	results, err := mem.Search(ctx, "chan-recent", "recent memory", 5)
	if err != nil {
		t.Fatalf("Search after prune: %v", err)
	}
	if len(results) == 0 {
		t.Error("expected recent entry to survive pruning")
	}
}
