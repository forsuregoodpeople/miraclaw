package orchestra_test

import (
	"context"
	"testing"

	"github.com/miraclaw/orchestra"
)

func TestNoOpMemoryAdd(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	msg := orchestra.NewMessage("id1", "hello", "chan1")
	if err := n.Add(context.Background(), msg, "user"); err != nil {
		t.Errorf("Add: %v", err)
	}
}

func TestNoOpMemoryAddBotReply(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	if err := n.AddBotReply(context.Background(), "chan1", "reply"); err != nil {
		t.Errorf("AddBotReply: %v", err)
	}
}

func TestNoOpMemoryGetSession(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	msgs, err := n.GetSession(context.Background(), "chan1", 10)
	if err != nil {
		t.Errorf("GetSession: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected empty session, got %d", len(msgs))
	}
}

func TestNoOpMemoryCloseSession(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	if err := n.CloseSession(context.Background(), "chan1"); err != nil {
		t.Errorf("CloseSession: %v", err)
	}
}

func TestNoOpMemorySearch(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	msgs, err := n.Search(context.Background(), "chan1", "query", 5)
	if err != nil {
		t.Errorf("Search: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected empty results, got %d", len(msgs))
	}
}

func TestNoOpMemorySearchStatic(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	msgs, err := n.SearchStatic(context.Background(), "chan1", "query", 5)
	if err != nil {
		t.Errorf("SearchStatic: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected empty results, got %d", len(msgs))
	}
}

func TestNoOpMemoryAddStatic(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	if err := n.AddStatic(context.Background(), "id", "text", "category"); err != nil {
		t.Errorf("AddStatic: %v", err)
	}
}

func TestNoOpMemoryGetStaticByCategory(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	msgs, err := n.GetStaticByCategory(context.Background(), "identity")
	if err != nil {
		t.Errorf("GetStaticByCategory: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected empty results, got %d", len(msgs))
	}
}

func TestNoOpMemoryPruneShortTerm(t *testing.T) {
	n := &orchestra.NoOpMemory{}
	if err := n.PruneShortTerm(context.Background(), 7); err != nil {
		t.Errorf("PruneShortTerm: %v", err)
	}
}

func TestNoOpMemorySatisfiesAgentMemoryInterface(t *testing.T) {
	var _ orchestra.AgentMemory = (*orchestra.NoOpMemory)(nil)
}
