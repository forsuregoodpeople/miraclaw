package channels_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/channels"
)

// mockMemory implements channels.MemoryUpdater for testing
type mockMemory struct {
	stored   []struct{ id, text, category string }
	identity string
	cleared  bool
}

func (m *mockMemory) AddStatic(_ context.Context, id, text, category string) error {
	if id == orchestra.IdentityID {
		m.identity = text
	} else {
		m.stored = append(m.stored, struct{ id, text, category string }{id, text, category})
	}
	return nil
}

func (m *mockMemory) GetStaticByCategory(_ context.Context, category string) ([]*orchestra.Message, error) {
	if category == orchestra.IdentityCategory && m.identity != "" {
		return []*orchestra.Message{{Text: m.identity}}, nil
	}
	return nil, nil
}

func (m *mockMemory) ClearAll(_ context.Context) error {
	m.stored = nil
	m.identity = ""
	m.cleared = true
	return nil
}

func newCommandHandler(provider, model string) *channels.CommandHandler {
	cfg := &channels.BotConfig{
		Provider: provider,
		Model:    model,
	}
	return channels.NewCommandHandler(cfg, nil, nil, nil)
}

func TestCommandStart(t *testing.T) {
	h := newCommandHandler("openai", "gpt-4o-mini")
	reply := h.Handle(context.Background(), "/start")
	if reply == "" {
		t.Error("expected non-empty reply for /start")
	}
	if !strings.Contains(strings.ToLower(reply), "sara") && !strings.Contains(strings.ToLower(reply), "hello") && !strings.Contains(strings.ToLower(reply), "halo") {
		t.Errorf("/start reply should contain greeting, got: %q", reply)
	}
}

func TestCommandHelp(t *testing.T) {
	h := newCommandHandler("openai", "gpt-4o-mini")
	reply := h.Handle(context.Background(), "/help")
	if !strings.Contains(reply, "/start") {
		t.Errorf("/help should list /start command, got: %q", reply)
	}
	if !strings.Contains(reply, "/new") || !strings.Contains(reply, "/clear") {
		t.Errorf("/help should list /new and /clear commands, got: %q", reply)
	}
	if !strings.Contains(reply, "/status") {
		t.Errorf("/help should list /status command, got: %q", reply)
	}
	if !strings.Contains(reply, "/model") {
		t.Errorf("/help should list /model command, got: %q", reply)
	}
}

func TestCommandStatus(t *testing.T) {
	h := newCommandHandler("openai", "gpt-4o-mini")
	reply := h.Handle(context.Background(), "/status")
	if !strings.Contains(reply, "openai") {
		t.Errorf("/status should show provider, got: %q", reply)
	}
	if !strings.Contains(reply, "gpt-4o-mini") {
		t.Errorf("/status should show model, got: %q", reply)
	}
}

func TestCommandNew(t *testing.T) {
	var closed string
	closeFn := func(_ context.Context, channelID string) error {
		closed = channelID
		return nil
	}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, closeFn, nil, nil)

	reply := h.HandleWithChannel(context.Background(), "/new", "chan-42")
	if closed != "chan-42" {
		t.Errorf("expected CloseSession called with 'chan-42', got %q", closed)
	}
	if reply == "" {
		t.Error("expected non-empty reply for /new")
	}
}

func TestCommandClear(t *testing.T) {
	var closed string
	closeFn := func(_ context.Context, channelID string) error {
		closed = channelID
		return nil
	}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, closeFn, nil, nil)

	reply := h.HandleWithChannel(context.Background(), "/clear", "chan-99")
	if closed != "chan-99" {
		t.Errorf("/clear: expected CloseSession called with 'chan-99', got %q", closed)
	}
	if reply == "" {
		t.Error("expected non-empty reply for /clear")
	}
}

func TestCommandModelWithArg(t *testing.T) {
	var savedModel string
	saveFn := func(model string) error {
		savedModel = model
		return nil
	}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, saveFn, nil)

	reply := h.Handle(context.Background(), "/model gpt-4o")
	if savedModel != "gpt-4o" {
		t.Errorf("expected model saved as 'gpt-4o', got %q", savedModel)
	}
	if !strings.Contains(reply, "gpt-4o") {
		t.Errorf("expected reply to mention new model, got: %q", reply)
	}
}

func TestCommandModelNoArg(t *testing.T) {
	modelList := []string{"gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"}
	listFn := func(_ context.Context) ([]string, error) {
		return modelList, nil
	}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, listFn)

	reply := h.Handle(context.Background(), "/model")
	for _, m := range modelList {
		if !strings.Contains(reply, m) {
			t.Errorf("/model should list %q, got: %q", m, reply)
		}
	}
}

func TestCommandUnknown(t *testing.T) {
	h := newCommandHandler("openai", "gpt-4o-mini")
	reply := h.Handle(context.Background(), "/unknown")
	if reply == "" {
		t.Error("expected reply for unknown command")
	}
}

func TestCommandRemember(t *testing.T) {
	mem := &mockMemory{}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, nil)
	h.SetMemory(mem)

	reply := h.Handle(context.Background(), "/remember besok ada meeting jam 10")
	if !strings.Contains(reply, "Tersimpan") && !strings.Contains(reply, "tersimpan") {
		t.Errorf("expected confirmation, got: %q", reply)
	}
	if len(mem.stored) == 0 {
		t.Error("expected AddStatic to be called")
	}
	if !strings.Contains(mem.stored[0].text, "besok ada meeting jam 10") {
		t.Errorf("expected stored text to contain input, got: %q", mem.stored[0].text)
	}
	if mem.stored[0].category != "user" {
		t.Errorf("expected category 'user', got: %q", mem.stored[0].category)
	}
}

func TestCommandRememberEmpty(t *testing.T) {
	mem := &mockMemory{}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, nil)
	h.SetMemory(mem)

	reply := h.Handle(context.Background(), "/remember")
	if len(mem.stored) > 0 {
		t.Error("expected no storage for empty remember")
	}
	if reply == "" {
		t.Error("expected usage hint for empty /remember")
	}
}

func TestCommandForget(t *testing.T) {
	mem := &mockMemory{}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, nil)
	h.SetMemory(mem)

	reply := h.Handle(context.Background(), "/forget")
	if !mem.cleared {
		t.Error("expected ClearAll to be called")
	}
	if reply == "" {
		t.Error("expected non-empty reply for /forget")
	}
}

func TestCommandIdentity(t *testing.T) {
	mem := &mockMemory{}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, nil)
	h.SetMemory(mem)

	reply := h.Handle(context.Background(), "/identity name:Sara")
	if !strings.Contains(reply, "Sara") {
		t.Errorf("expected Sara in reply, got: %q", reply)
	}
	if !strings.Contains(mem.identity, "Sara") {
		t.Errorf("expected identity to contain 'Sara', got: %q", mem.identity)
	}
}

func TestCommandIdentityLanguage(t *testing.T) {
	mem := &mockMemory{identity: "name: Mira"}
	cfg := &channels.BotConfig{Provider: "openai", Model: "gpt-4o-mini"}
	h := channels.NewCommandHandler(cfg, nil, nil, nil)
	h.SetMemory(mem)

	// Update language, name should persist
	reply := h.Handle(context.Background(), "/identity language:Indonesian")
	if !strings.Contains(reply, "Indonesian") {
		t.Errorf("expected Indonesian in reply, got: %q", reply)
	}
	if !strings.Contains(mem.identity, "Mira") {
		t.Errorf("expected name 'Mira' to persist after language update, got: %q", mem.identity)
	}
	if !strings.Contains(mem.identity, "Indonesian") {
		t.Errorf("expected language 'Indonesian' in identity, got: %q", mem.identity)
	}
}
