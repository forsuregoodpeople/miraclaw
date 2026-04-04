package scheduler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
)

// fakeAgent records calls to Reply.
type fakeAgent struct {
	reply string
	err   error
	calls []*orchestra.Message
}

func (f *fakeAgent) Reply(_ context.Context, msg *orchestra.Message) (string, error) {
	f.calls = append(f.calls, msg)
	return f.reply, f.err
}

// fakeSender records calls to SendBubbles.
type fakeSender struct {
	err   error
	calls []struct {
		chatID int64
		text   string
	}
}

func (f *fakeSender) SendBubbles(_ context.Context, chatID int64, text string) error {
	f.calls = append(f.calls, struct {
		chatID int64
		text   string
	}{chatID, text})
	return f.err
}

func TestSchedulerNoRulesIsNoop(t *testing.T) {
	agent := &fakeAgent{reply: "hello"}
	sender := &fakeSender{}
	s := New(nil, agent, sender)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx) // must not panic or block
	cancel()
	s.Stop()
}

func TestSchedulerFireCallsAgentAndSender(t *testing.T) {
	agent := &fakeAgent{reply: "good morning!"}
	sender := &fakeSender{}
	rule := config.ScheduleRule{
		Cron:   "* * * * *",
		Prompt: "Say good morning",
		ChatID: 42,
	}
	s := New([]config.ScheduleRule{rule}, agent, sender)

	s.fire(context.Background(), rule)

	if len(agent.calls) != 1 {
		t.Fatalf("expected 1 agent call, got %d", len(agent.calls))
	}
	if agent.calls[0].Text != "Say good morning" {
		t.Errorf("expected prompt %q, got %q", "Say good morning", agent.calls[0].Text)
	}
	if agent.calls[0].ChannelID != "42" {
		t.Errorf("expected channelID %q, got %q", "42", agent.calls[0].ChannelID)
	}
	if !strings.HasPrefix(agent.calls[0].ID, "sched-") {
		t.Errorf("expected ID to start with 'sched-', got %q", agent.calls[0].ID)
	}

	if len(sender.calls) != 1 {
		t.Fatalf("expected 1 sender call, got %d", len(sender.calls))
	}
	if sender.calls[0].chatID != 42 {
		t.Errorf("expected chatID 42, got %d", sender.calls[0].chatID)
	}
	if sender.calls[0].text != "good morning!" {
		t.Errorf("expected text %q, got %q", "good morning!", sender.calls[0].text)
	}
}

func TestSchedulerAgentErrorDoesNotCrash(t *testing.T) {
	agent := &fakeAgent{err: errors.New("llm down")}
	sender := &fakeSender{}
	rule := config.ScheduleRule{Cron: "* * * * *", Prompt: "hello", ChatID: 1}
	s := New([]config.ScheduleRule{rule}, agent, sender)

	s.fire(context.Background(), rule) // must not panic

	if len(sender.calls) != 0 {
		t.Errorf("sender should not be called when agent errors, got %d calls", len(sender.calls))
	}
}

func TestSchedulerSenderErrorDoesNotCrash(t *testing.T) {
	agent := &fakeAgent{reply: "hi"}
	sender := &fakeSender{err: errors.New("telegram down")}
	rule := config.ScheduleRule{Cron: "* * * * *", Prompt: "hello", ChatID: 1}
	s := New([]config.ScheduleRule{rule}, agent, sender)

	s.fire(context.Background(), rule) // must not panic
}

func TestSchedulerEmptyReplySkipsSend(t *testing.T) {
	agent := &fakeAgent{reply: ""}
	sender := &fakeSender{}
	rule := config.ScheduleRule{Cron: "* * * * *", Prompt: "hello", ChatID: 1}
	s := New([]config.ScheduleRule{rule}, agent, sender)

	s.fire(context.Background(), rule)

	if len(sender.calls) != 0 {
		t.Errorf("sender should not be called for empty reply, got %d calls", len(sender.calls))
	}
}

func TestSchedulerAddRuleAtRuntime(t *testing.T) {
	agent := &fakeAgent{reply: "hi"}
	sender := &fakeSender{}
	s := New(nil, agent, sender)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)

	rule := config.ScheduleRule{Cron: "* * * * *", Prompt: "runtime rule", ChatID: 99}
	if err := s.AddRule(ctx, rule); err != nil {
		t.Fatalf("AddRule: %v", err)
	}

	rules := s.Rules()
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}
	if rules[0].Prompt != "runtime rule" {
		t.Errorf("expected prompt %q, got %q", "runtime rule", rules[0].Prompt)
	}

	// Verify fire works for the added rule
	s.fire(ctx, rule)
	if len(agent.calls) != 1 {
		t.Errorf("expected 1 agent call after fire, got %d", len(agent.calls))
	}
}

func TestSchedulerRemoveRule(t *testing.T) {
	rule1 := config.ScheduleRule{Cron: "0 9 * * *", Prompt: "morning", ChatID: 1}
	rule2 := config.ScheduleRule{Cron: "0 22 * * *", Prompt: "evening", ChatID: 1}
	agent := &fakeAgent{reply: "ok"}
	sender := &fakeSender{}
	s := New([]config.ScheduleRule{rule1, rule2}, agent, sender)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)

	if err := s.RemoveRule(0); err != nil {
		t.Fatalf("RemoveRule: %v", err)
	}

	rules := s.Rules()
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule after removal, got %d", len(rules))
	}
	if rules[0].Prompt != "evening" {
		t.Errorf("expected remaining rule to be 'evening', got %q", rules[0].Prompt)
	}
}

func TestSchedulerRemoveRuleOutOfRange(t *testing.T) {
	s := New(nil, &fakeAgent{}, &fakeSender{})
	if err := s.RemoveRule(0); err == nil {
		t.Error("expected error for out-of-range index")
	}
}
