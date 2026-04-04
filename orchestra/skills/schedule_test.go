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
