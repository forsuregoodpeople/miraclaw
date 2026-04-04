package skills_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

// planMemory stores static records keyed by ID, with category tracking.
type planMemory struct {
	records []struct{ id, text, category string }
}

func (p *planMemory) AddStatic(_ context.Context, id, text, category string) error {
	// upsert
	for i, r := range p.records {
		if r.id == id {
			p.records[i] = struct{ id, text, category string }{id, text, category}
			return nil
		}
	}
	p.records = append(p.records, struct{ id, text, category string }{id, text, category})
	return nil
}

func (p *planMemory) GetStaticByCategory(_ context.Context, category string) ([]*orchestra.Message, error) {
	var out []*orchestra.Message
	for _, r := range p.records {
		if r.category == category {
			out = append(out, &orchestra.Message{ID: r.id, Text: r.text})
		}
	}
	return out, nil
}

func TestPlanAddSkill(t *testing.T) {
	mem := &planMemory{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterPlanSkills(sys, mem)

	result, err := sys.Run(context.Background(), "plan_add", "Sprint Q2|||[ ] Deploy feature X\n[ ] Review PRs")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mem.records) != 1 {
		t.Fatalf("expected 1 plan record, got %d", len(mem.records))
	}
	if mem.records[0].category != "plan" {
		t.Errorf("expected category 'plan', got %q", mem.records[0].category)
	}
	if !strings.Contains(mem.records[0].text, "Sprint Q2") {
		t.Errorf("expected title in stored text, got %q", mem.records[0].text)
	}
	if result == "" {
		t.Error("expected non-empty confirmation")
	}
}

func TestPlanAddInvalidFormat(t *testing.T) {
	mem := &planMemory{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterPlanSkills(sys, mem)

	_, err := sys.Run(context.Background(), "plan_add", "no separator here")
	if err == nil {
		t.Error("expected error for missing ||| separator")
	}
}

func TestPlanGetSkill(t *testing.T) {
	mem := &planMemory{
		records: []struct{ id, text, category string }{
			{"plan-abc", "Sprint Q2\n[ ] Task 1\n[ ] Task 2", "plan"},
		},
	}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterPlanSkills(sys, mem)

	result, err := sys.Run(context.Background(), "plan_get", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "Sprint Q2") {
		t.Errorf("expected 'Sprint Q2' in result, got %q", result)
	}
}

func TestPlanGetEmptyReturnsMessage(t *testing.T) {
	mem := &planMemory{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterPlanSkills(sys, mem)

	result, err := sys.Run(context.Background(), "plan_get", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Error("expected non-empty message for empty plans")
	}
}

func TestPlanUpdateSkill(t *testing.T) {
	mem := &planMemory{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterPlanSkills(sys, mem)

	// Add first
	_, _ = sys.Run(context.Background(), "plan_add", "My Plan|||[ ] Task 1")
	if len(mem.records) != 1 {
		t.Fatalf("setup failed")
	}
	firstID := mem.records[0].id

	// Update same plan — should upsert same ID
	_, err := sys.Run(context.Background(), "plan_update", "My Plan|||[x] Task 1\n[ ] Task 2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mem.records) != 1 {
		t.Errorf("expected 1 record after update (upsert), got %d", len(mem.records))
	}
	if mem.records[0].id != firstID {
		t.Errorf("expected same ID after update, got %q vs %q", firstID, mem.records[0].id)
	}
	if !strings.Contains(mem.records[0].text, "Task 2") {
		t.Errorf("expected updated content, got %q", mem.records[0].text)
	}
}
