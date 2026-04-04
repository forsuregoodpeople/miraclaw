package orchestra_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

// fakeMemory is an in-process Memory substitute for unit tests.
type fakeMemory struct {
	added         []*addedEntry
	session       []*orchestra.Message
	searched      []*orchestra.Message
	staticResults []*orchestra.Message
	staticAdded   []struct{ id, text, category string }
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

func (f *fakeMemory) Search(_ context.Context, _, _ string, _ uint64) ([]*orchestra.Message, error) {
	return f.searched, nil
}

func (f *fakeMemory) CloseSession(_ context.Context, _ string) error {
	f.session = nil
	return nil
}

func (f *fakeMemory) SearchStatic(_ context.Context, _, _ string, _ uint64) ([]*orchestra.Message, error) {
	return f.staticResults, nil
}

func (f *fakeMemory) AddStatic(_ context.Context, id, text, category string) error {
	f.staticAdded = append(f.staticAdded, struct{ id, text, category string }{id, text, category})
	return nil
}

func (f *fakeMemory) GetStaticByCategory(_ context.Context, _ string) ([]*orchestra.Message, error) {
	return f.staticResults, nil
}

func (f *fakeMemory) PromoteToLongTerm(_ context.Context, _ string) error {
	return nil
}

func (f *fakeMemory) ClearAll(_ context.Context) error {
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
	// system message should contain persona (always injected)
	if !strings.Contains(llm.lastReq.Messages[0].Content, "Current date:") {
		t.Errorf("expected date in system message, got: %q", llm.lastReq.Messages[0].Content)
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
	llm := &multiMockLLM{
		responses: []string{
			"SKILL:datetime:",          // first call: invoke skill
			"2026-04-04T00:00:00Z",    // second call: format result
		},
	}
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

// TestAgentReplySkillWithPreamble verifies that a skill call is parsed even when
// the LLM returns preamble text before the SKILL: line.
func TestAgentReplySkillWithPreamble(t *testing.T) {
	mem := &fakeMemory{}
	llm := &multiMockLLM{
		responses: []string{
			"Baik, saya akan memeriksa sistem kamu sekarang!\nSKILL:sysinfo:all", // preamble + skill
			"Sistem kamu berjalan dengan baik.",                                   // second call: formatted
		},
	}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	sys.Register("sysinfo", "system info", func(_ context.Context, _ string) (string, error) {
		return "RAM: 16GB | CPU: 8 cores", nil
	})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-preamble", "cek sistem saya", "chan-p")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	// Should return the formatted response, not the raw skill string
	if strings.Contains(reply, "SKILL:") {
		t.Errorf("raw SKILL: string leaked into reply: %q", reply)
	}
	if reply != "Sistem kamu berjalan dengan baik." {
		t.Errorf("expected formatted reply, got %q", reply)
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

func TestAgentNilLLMReturnsError(t *testing.T) {
	mem := &fakeMemory{}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, nil, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-nil", "hello", "chan-nil")
	_, err := agent.Reply(context.Background(), msg)
	if err == nil {
		t.Fatal("expected error when LLM is nil, got nil")
	}
}

type errBotReplyMemory struct {
	fakeMemory
}

func (e *errBotReplyMemory) AddBotReply(_ context.Context, _ string, _ string) error {
	return fmt.Errorf("storage full")
}

func TestAgentAddBotReplyErrorDoesNotPropagate(t *testing.T) {
	mem := &errBotReplyMemory{}
	llm := &mockLLM{response: "hi"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-log", "hello", "chan-log")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("AddBotReply error should not propagate: %v", err)
	}
	if reply != "hi" {
		t.Errorf("expected reply 'hi', got %q", reply)
	}
}

// multiMockLLM returns responses in sequence; last response is repeated.
type multiMockLLM struct {
	responses []string
	errors    []error
	callCount int
	lastReq   orchestra.Request
}

func (m *multiMockLLM) Complete(_ context.Context, req orchestra.Request) (string, error) {
	m.lastReq = req
	i := m.callCount
	if i >= len(m.responses) {
		i = len(m.responses) - 1
	}
	m.callCount++
	var err error
	if i < len(m.errors) && m.errors[i] != nil {
		err = m.errors[i]
	}
	return m.responses[i], err
}

func TestAgentSkillResultFormattedBySecondLLMCall(t *testing.T) {
	mem := &fakeMemory{}
	llm := &multiMockLLM{
		responses: []string{
			"SKILL:sysinfo:ram",                // first call: LLM calls skill
			"RAM server kamu sekarang 10 GB",   // second call: LLM formats result
		},
	}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	sys.Register("sysinfo", "system info", func(_ context.Context, _ string) (string, error) {
		return "RAM: Total 29.3 GB | Used 10.0 GB | Available 19.3 GB", nil
	})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 200})

	msg := orchestra.NewMessage("msg-skill", "berapa RAM sekarang?", "chan-skill")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	if reply != "RAM server kamu sekarang 10 GB" {
		t.Errorf("expected formatted reply from second LLM call, got %q", reply)
	}
	if llm.callCount != 2 {
		t.Errorf("expected 2 LLM calls (first + format), got %d", llm.callCount)
	}
}

func TestAgentUnknownSkillReturnsError(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "SKILL:name:mira"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-unk", "nama kamu jadi mira ya", "chan-unk")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	if !strings.Contains(reply, "skill name error") {
		t.Errorf("expected skill-not-found error message, got %q", reply)
	}
}

func TestAgentSkillSecondLLMCallFallsBackOnError(t *testing.T) {
	mem := &fakeMemory{}
	llm := &multiMockLLM{
		responses: []string{"SKILL:sysinfo:ram", ""},
		errors:    []error{nil, fmt.Errorf("timeout")},
	}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	sys.Register("sysinfo", "system info", func(_ context.Context, _ string) (string, error) {
		return "RAM: Total 29.3 GB | Used 10.0 GB | Available 19.3 GB", nil
	})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 200})

	msg := orchestra.NewMessage("msg-fallback", "berapa RAM?", "chan-fallback")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	// Should fall back to raw skill output
	if reply != "RAM: Total 29.3 GB | Used 10.0 GB | Available 19.3 GB" {
		t.Errorf("expected raw skill result on second LLM error, got %q", reply)
	}
}

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

func TestAgentSessionRolesPreservedInLLMMessages(t *testing.T) {
	// Session messages with explicit Role set — buildMessages must use Role, not ID-prefix heuristic.
	userMsg := orchestra.NewMessage("user-111", "what is Go?", "chan-6")
	userMsg.Role = "user"
	botMsg := orchestra.NewMessage("bot-reply-222", "Go is a language.", "chan-6")
	botMsg.Role = "assistant"

	mem := &fakeMemory{session: []*orchestra.Message{userMsg, botMsg}}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-6", "tell me more", "chan-6")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	// Find the session messages in LLM request (exclude system and final user input)
	var sessionMsgs []orchestra.ChatMessage
	for _, m := range llm.lastReq.Messages {
		if m.Role != "system" {
			sessionMsgs = append(sessionMsgs, m)
		}
	}

	// Should have: user history, bot history, current user input — at least 3
	if len(sessionMsgs) < 3 {
		t.Fatalf("expected at least 3 non-system messages, got %d: %+v", len(sessionMsgs), sessionMsgs)
	}

	// First two must be "user" then "assistant" from session history
	if sessionMsgs[0].Role != "user" {
		t.Errorf("expected session[0] role 'user', got %q", sessionMsgs[0].Role)
	}
	if sessionMsgs[1].Role != "assistant" {
		t.Errorf("expected session[1] role 'assistant', got %q", sessionMsgs[1].Role)
	}
	// Last must be current user input
	last := sessionMsgs[len(sessionMsgs)-1]
	if last.Role != "user" || last.Content != "tell me more" {
		t.Errorf("expected last message to be user 'tell me more', got role=%q content=%q", last.Role, last.Content)
	}
}

// TestAgentBackgroundRemember verifies that SKILL:remember in LLM response
// is executed silently and stripped from the reply sent to the user.
func TestAgentBackgroundRemember(t *testing.T) {
	mem := &fakeMemory{}
	// LLM returns a natural reply with an embedded background skill call
	llm := &mockLLM{response: "Oke, noted!\n\nSKILL:remember:user suka kopi hitam"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	skills.RegisterMemorySkills(sys, mem)

	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})
	msg := orchestra.NewMessage("msg-bg", "saya suka kopi hitam", "chan-bg")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	// Reply to user must NOT contain the SKILL line
	if strings.Contains(reply, "SKILL:") {
		t.Errorf("reply should not contain SKILL directive, got: %q", reply)
	}
	// Reply should contain the natural part
	if !strings.Contains(reply, "noted") && !strings.Contains(reply, "Oke") {
		t.Errorf("expected natural reply, got: %q", reply)
	}
	// Memory must have been saved
	if len(mem.staticAdded) == 0 {
		t.Error("expected AddStatic to be called for background remember")
	}
	saved := false
	for _, s := range mem.staticAdded {
		if strings.Contains(s.text, "kopi hitam") {
			saved = true
		}
	}
	if !saved {
		t.Errorf("expected 'kopi hitam' to be saved to memory, staticAdded: %+v", mem.staticAdded)
	}
}

// TestBuildMessagesContextWindowTrimsEpisodic verifies that when ContextWindow
// is small, the episodic "Background:" message is dropped.
func TestBuildMessagesContextWindowTrimsEpisodic(t *testing.T) {
	longEpisodic := strings.Repeat("x", 400) // ~100 estimated tokens
	mem := &fakeMemory{
		searched: []*orchestra.Message{
			orchestra.NewMessage("ep-1", longEpisodic, "chan-cw"),
		},
	}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxOutputTokens: 100,
		ContextWindow:   50, // very small — episodic won't fit
	})

	msg := orchestra.NewMessage("msg-cw1", "hi", "chan-cw")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	for _, m := range llm.lastReq.Messages {
		if strings.HasPrefix(m.Content, "Background:") {
			t.Errorf("expected episodic Background message to be trimmed, but it was included")
		}
	}
}

// TestBuildMessagesContextWindowTrimsSessionHistory verifies that oldest session
// turns are dropped when the budget is exceeded.
func TestBuildMessagesContextWindowTrimsSessionHistory(t *testing.T) {
	longTurn := strings.Repeat("y", 300) // ~75 estimated tokens each
	userMsg1 := orchestra.NewMessage("u1", longTurn, "chan-cw2")
	userMsg1.Role = "user"
	botMsg1 := orchestra.NewMessage("b1", longTurn, "chan-cw2")
	botMsg1.Role = "assistant"
	userMsg2 := orchestra.NewMessage("u2", "recent question", "chan-cw2")
	userMsg2.Role = "user"

	mem := &fakeMemory{
		session: []*orchestra.Message{userMsg1, botMsg1, userMsg2},
	}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	// Budget: small enough to drop old turns but keep most recent
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxOutputTokens: 100,
		ContextWindow:   100, // system prompt + input fits; old turns don't
	})

	msg := orchestra.NewMessage("msg-cw2", "new input", "chan-cw2")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	// Count non-system messages — should be fewer than 3 (old turns dropped) + 1 (current input)
	var nonSystem []orchestra.ChatMessage
	for _, m := range llm.lastReq.Messages {
		if m.Role != "system" {
			nonSystem = append(nonSystem, m)
		}
	}
	// All 3 session turns + current input = 4; with trimming, should be < 4
	if len(nonSystem) >= 4 {
		t.Errorf("expected session history to be trimmed, got %d non-system messages", len(nonSystem))
	}
	// The current user input must always be present
	last := nonSystem[len(nonSystem)-1]
	if last.Content != "new input" {
		t.Errorf("expected current input to be last message, got %q", last.Content)
	}
}

// TestBuildMessagesContextWindowZeroMeansNoLimit verifies that ContextWindow=0
// passes all messages through without trimming.
func TestBuildMessagesContextWindowZeroMeansNoLimit(t *testing.T) {
	longText := strings.Repeat("z", 500)
	userMsg := orchestra.NewMessage("u1", longText, "chan-cw3")
	userMsg.Role = "user"
	botMsg := orchestra.NewMessage("b1", longText, "chan-cw3")
	botMsg.Role = "assistant"

	mem := &fakeMemory{
		session:  []*orchestra.Message{userMsg, botMsg},
		searched: []*orchestra.Message{orchestra.NewMessage("ep-1", longText, "chan-cw3")},
	}
	llm := &mockLLM{response: "ok"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{
		MaxOutputTokens: 100,
		ContextWindow:   0, // no limit
	})

	msg := orchestra.NewMessage("msg-cw3", "test", "chan-cw3")
	_, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}

	// Background should be present (not trimmed)
	hasBg := false
	for _, m := range llm.lastReq.Messages {
		if strings.HasPrefix(m.Content, "Background:") {
			hasBg = true
		}
	}
	if !hasBg {
		t.Error("expected Background message to be present when ContextWindow=0 (no limit)")
	}
}

// TestAgentBackgroundRememberDoesNotReplaceReply verifies that a plain reply
// (no SKILL) is returned unchanged.
func TestAgentBackgroundRememberDoesNotReplaceReply(t *testing.T) {
	mem := &fakeMemory{}
	llm := &mockLLM{response: "Halo!"}
	sys := orchestra.NewSystem(orchestra.SystemConfig{})
	agent := orchestra.NewAgent(mem, llm, sys, orchestra.AgentConfig{MaxOutputTokens: 100})

	msg := orchestra.NewMessage("msg-plain", "halo", "chan-plain")
	reply, err := agent.Reply(context.Background(), msg)
	if err != nil {
		t.Fatalf("Reply error: %v", err)
	}
	if reply != "Halo!" {
		t.Errorf("expected unchanged reply 'Halo!', got: %q", reply)
	}
}
