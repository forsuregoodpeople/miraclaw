package skills_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

// fakeScheduler implements skills.SchedulerUpdater for testing.
type fakeScheduler struct {
	rules    []config.ScheduleRule
	addErr   error
	addCalls int
}

func (f *fakeScheduler) AddRule(_ context.Context, rule config.ScheduleRule) error {
	if f.addErr != nil {
		return f.addErr
	}
	f.addCalls++
	f.rules = append(f.rules, rule)
	return nil
}

func (f *fakeScheduler) RemoveRule(index int) error {
	if index < 0 || index >= len(f.rules) {
		return context.Canceled // any error
	}
	f.rules = append(f.rules[:index], f.rules[index+1:]...)
	return nil
}

func (f *fakeScheduler) Rules() []config.ScheduleRule {
	return append([]config.ScheduleRule(nil), f.rules...)
}

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

// --- Schedule skill tests ---

func TestCreateScheduleSkill(t *testing.T) {
	sched := &fakeScheduler{}
	var saved bool
	saveFn := func() error { saved = true; return nil }
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, saveFn)

	result, err := sys.Run(context.Background(), "create_schedule", "0 9 * * 1-5|||Good morning!")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sched.addCalls != 1 {
		t.Errorf("expected AddRule called once, got %d", sched.addCalls)
	}
	if sched.rules[0].Cron != "0 9 * * 1-5" {
		t.Errorf("expected cron %q, got %q", "0 9 * * 1-5", sched.rules[0].Cron)
	}
	if sched.rules[0].Prompt != "Good morning!" {
		t.Errorf("expected prompt %q, got %q", "Good morning!", sched.rules[0].Prompt)
	}
	if sched.rules[0].ChatID != 42 {
		t.Errorf("expected chatID 42, got %d", sched.rules[0].ChatID)
	}
	if !saved {
		t.Error("expected saveFn to be called")
	}
	if result == "" {
		t.Error("expected non-empty confirmation")
	}
}

func TestCreateScheduleInvalidFormat(t *testing.T) {
	sched := &fakeScheduler{}
	var saved bool
	saveFn := func() error { saved = true; return nil }
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, saveFn)

	_, err := sys.Run(context.Background(), "create_schedule", "no-separator-here")
	if err == nil {
		t.Error("expected error for missing ||| separator")
	}
	if saved {
		t.Error("saveFn must not be called on error")
	}
	if sched.addCalls != 0 {
		t.Error("AddRule must not be called on error")
	}
}

func TestListSchedulesEmpty(t *testing.T) {
	sched := &fakeScheduler{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, func() error { return nil })

	result, err := sys.Run(context.Background(), "list_schedules", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(strings.ToLower(result), "no") && !strings.Contains(result, "kosong") {
		t.Errorf("expected empty schedule message, got %q", result)
	}
}

func TestListSchedulesWithRules(t *testing.T) {
	sched := &fakeScheduler{
		rules: []config.ScheduleRule{
			{Cron: "0 9 * * *", Prompt: "Morning reminder", ChatID: 42},
			{Cron: "0 22 * * *", Prompt: "Evening check-in", ChatID: 42},
		},
	}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, func() error { return nil })

	result, err := sys.Run(context.Background(), "list_schedules", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "Morning reminder") {
		t.Errorf("expected 'Morning reminder' in result, got %q", result)
	}
	if !strings.Contains(result, "Evening check-in") {
		t.Errorf("expected 'Evening check-in' in result, got %q", result)
	}
}

func TestDeleteScheduleSkill(t *testing.T) {
	sched := &fakeScheduler{
		rules: []config.ScheduleRule{
			{Cron: "0 9 * * *", Prompt: "Morning", ChatID: 42},
		},
	}
	var saved bool
	saveFn := func() error { saved = true; return nil }
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, saveFn)

	result, err := sys.Run(context.Background(), "delete_schedule", "0")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sched.rules) != 0 {
		t.Errorf("expected 0 rules after delete, got %d", len(sched.rules))
	}
	if !saved {
		t.Error("expected saveFn to be called")
	}
	if result == "" {
		t.Error("expected non-empty confirmation")
	}
}

func TestDeleteScheduleInvalidIndex(t *testing.T) {
	sched := &fakeScheduler{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterScheduleSkills(sys, sched, 42, func() error { return nil })

	_, err := sys.Run(context.Background(), "delete_schedule", "99")
	if err == nil {
		t.Error("expected error for out-of-range index")
	}
}

// --- Plan skill tests ---

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
