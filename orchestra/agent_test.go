package orchestra_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
)

// fakeMemory is an in-process Memory substitute for unit tests.
type fakeMemory struct {
	added    []*addedEntry
	session  []*orchestra.Message
	searched []*orchestra.Message
}

type addedEntry struct {
	msg  *orchestra.Message
	role string
}

func (f *fakeMemory) Add(_ context.Context, msg *orchestra.Message, role string) error {
	f.added = append(f.added, &addedEntry{msg: msg, role: role})
	return nil
}

func (f *fakeMemory) AddBotReply(_ context.Context, channelID, text string) error {
	msg := orchestra.NewMessage("bot-reply", text, channelID)
	f.added = append(f.added, &addedEntry{msg: msg, role: "assistant"})
	return nil
}

func (f *fakeMemory) GetSession(_ context.Context, _ string, _ uint64) ([]*orchestra.Message, error) {
	return f.session, nil
}

func (f *fakeMemory) Search(_ context.Context, _ string, _ uint64) ([]*orchestra.Message, error) {
	return f.searched, nil
}

func (f *fakeMemory) CloseSession(_ context.Context, _ string) error {
	f.session = nil
	return nil
}

// Verify fakeMemory satisfies AgentMemory interface.
var _ orchestra.AgentMemory = (*fakeMemory)(nil)

func TestAgentReplyStoresUserAndBot(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "Hello from bot"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxContextMessages: 2,
		MaxHistoryTurns:    4,
		MaxOutputTokens:    100,
	})

	msg := orchestra.NewMessage("msg-1", "Hi", "chan-1")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	if reply != "Hello from bot" {
		t.Errorf("expected 'Hello from bot', got %q", reply)
	}

	// Should have stored user message and bot reply
	if len(mem.added) < 2 {
		t.Errorf("expected at least 2 stored entries (user + bot), got %d", len(mem.added))
	}
	roles := make([]string, len(mem.added))
	for i, e := range mem.added {
		roles[i] = e.role
	}
	hasUser := false
	hasBot := false
	for _, r := range roles {
		if r == "user" {
			hasUser = true
		}
		if r == "assistant" {
			hasBot = true
		}
	}
	if !hasUser {
		t.Error("expected a 'user' role entry to be stored")
	}
	if !hasBot {
		t.Error("expected an 'assistant' role entry to be stored")
	}
}

func TestAgentReplyUsesRoleBasedMessages(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxOutputTokens: 100,
		SystemPrompt:    "You are a test bot.",
	})

	msg := orchestra.NewMessage("msg-2", "ping", "chan-2")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	// LLM should receive role-based messages
	if len(llm.lastReq.Messages) == 0 {
		t.Fatal("expected LLM to receive messages, got none")
	}
	firstRole := llm.lastReq.Messages[0].Role
	if firstRole != "system" {
		t.Errorf("expected first message role to be 'system', got %q", firstRole)
	}
	// system prompt should appear in first message
	if !strings.Contains(llm.lastReq.Messages[0].Content, "test bot") {
		t.Errorf("expected system prompt in first message, got: %q", llm.lastReq.Messages[0].Content)
	}
	// last message should be the user input
	last := llm.lastReq.Messages[len(llm.lastReq.Messages)-1]
	if last.Role != "user" {
		t.Errorf("expected last message role to be 'user', got %q", last.Role)
	}
	if last.Content != "ping" {
		t.Errorf("expected last message content 'ping', got %q", last.Content)
	}
}

func TestAgentReplySkillDispatch(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "SKILL:datetime:"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	sys.Register("datetime", "current time", func(_ context.Context, _ string) (string, error) {
		return "2026-04-04T00:00:00Z", nil
	})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-3", "what time is it?", "chan-3")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	if reply != "2026-04-04T00:00:00Z" {
		t.Errorf("expected skill result, got %q", reply)
	}
}

func TestAgentReplySecurityReject(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "should not reach"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxOutputTokens: 100,
		TextScanner: func(s string) error {
			if strings.Contains(s, "DROP TABLE") {
				return &testScanError{}
			}
			return nil
		},
	})

	msg := orchestra.NewMessage("msg-4", "DROP TABLE users;", "chan-4")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(reply, "rejected") {
		t.Errorf("expected security rejection message, got %q", reply)
	}
}

type testScanError struct{}

func (e *testScanError) Error() string { return "injection detected" }

func TestAgentSessionHistoryIncludedInMessages(t *testing.T) {
	mem := &fakeMemory{
		session: []*orchestra.Message{
			orchestra.NewMessage("old-1", "previous user msg", "chan-5"),
			orchestra.NewMessage("old-2", "previous bot reply", "chan-5"),
		},
	}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-5", "new input", "chan-5")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	// The LLM should have received more than just the current user message
	if len(llm.lastReq.Messages) < 2 {
		t.Errorf("expected session history to be included in LLM messages, got %d messages", len(llm.lastReq.Messages))
	}
}
