package channels_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra/channels"
)

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
