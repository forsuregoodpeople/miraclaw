package channels

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// BotConfig holds runtime-mutable bot configuration exposed to CommandHandler.
type BotConfig struct {
	Provider string
	Model    string
}

// CommandHandler handles bot slash commands independently of Telegram transport.
// It is safe for concurrent use as long as the caller manages BotConfig mutations.
type CommandHandler struct {
	cfg      *BotConfig
	closeFn  func(ctx context.Context, channelID string) error // for /new, /clear
	saveFn   func(model string) error                          // for /model <name>
	listFn   func(ctx context.Context) ([]string, error)       // for /model (list)
}

// NewCommandHandler creates a CommandHandler.
//   - closeFn: called on /new and /clear to reset session; may be nil
//   - saveFn:  called on /model <name> to persist the new model; may be nil
//   - listFn:  called on /model (no arg) to list available models; may be nil
func NewCommandHandler(
	cfg *BotConfig,
	closeFn func(ctx context.Context, channelID string) error,
	saveFn func(model string) error,
	listFn func(ctx context.Context) ([]string, error),
) *CommandHandler {
	return &CommandHandler{cfg: cfg, closeFn: closeFn, saveFn: saveFn, listFn: listFn}
}

// Handle processes a command string (e.g. "/start", "/model gpt-4o") and returns the reply.
// Uses empty string as channelID — use HandleWithChannel when channelID matters.
func (h *CommandHandler) Handle(ctx context.Context, text string) string {
	return h.HandleWithChannel(ctx, text, "")
}

// HandleWithChannel is like Handle but with an explicit channelID for session operations.
func (h *CommandHandler) HandleWithChannel(ctx context.Context, text, channelID string) string {
	// Strip bot username suffix (e.g. "/start@MyBot" → "/start")
	if idx := strings.Index(text, "@"); idx > 0 {
		text = text[:idx]
	}
	cmd, arg, _ := strings.Cut(strings.TrimPrefix(text, "/"), " ")
	cmd = strings.ToLower(strings.TrimSpace(cmd))
	arg = strings.TrimSpace(arg)

	switch cmd {
	case "start":
		return h.handleStart()
	case "help":
		return h.handleHelp()
	case "new", "clear":
		return h.handleNew(ctx, channelID)
	case "status":
		return h.handleStatus()
	case "model":
		return h.handleModel(ctx, arg)
	default:
		return fmt.Sprintf("Unknown command: /%s\nSend /help for the list of available commands.", cmd)
	}
}

func (h *CommandHandler) handleStart() string {
	return "Hello! I'm Sara, your AI assistant.\n\nSend me a message to start chatting. Use /help to see available commands."
}

func (h *CommandHandler) handleHelp() string {
	var b strings.Builder
	b.WriteString("Commands:\n")
	b.WriteString("  /start  — show this welcome message\n")
	b.WriteString("  /new    — start a new conversation (clear history)\n")
	b.WriteString("  /clear  — alias for /new\n")
	b.WriteString("  /status — show bot status (provider, model)\n")
	b.WriteString("  /model  — list available models\n")
	b.WriteString("  /model <name> — switch to a different model\n")
	b.WriteString("  /help   — show this message")
	return b.String()
}

func (h *CommandHandler) handleNew(ctx context.Context, channelID string) string {
	if h.closeFn != nil && channelID != "" {
		if err := h.closeFn(ctx, channelID); err != nil {
			return fmt.Sprintf("Failed to clear session: %v", err)
		}
	}
	return "Conversation cleared. Starting fresh!"
}

func (h *CommandHandler) handleStatus() string {
	return fmt.Sprintf("Status:\n  Provider: %s\n  Model: %s", h.cfg.Provider, h.cfg.Model)
}

func (h *CommandHandler) handleModel(ctx context.Context, arg string) string {
	if arg == "" {
		// List available models
		if h.listFn == nil {
			return "Model listing not supported for this provider."
		}
		models, err := h.listFn(ctx)
		if err != nil {
			return fmt.Sprintf("Failed to fetch models: %v", err)
		}
		if len(models) == 0 {
			return "No models found."
		}
		sort.Strings(models)
		var b strings.Builder
		b.WriteString(fmt.Sprintf("Available models (current: %s):\n", h.cfg.Model))
		for _, m := range models {
			if m == h.cfg.Model {
				b.WriteString(fmt.Sprintf("  • %s ← current\n", m))
			} else {
				b.WriteString(fmt.Sprintf("  • %s\n", m))
			}
		}
		b.WriteString("\nUse /model <name> to switch.")
		return strings.TrimRight(b.String(), "\n")
	}

	// Switch model
	h.cfg.Model = arg
	if h.saveFn != nil {
		if err := h.saveFn(arg); err != nil {
			return fmt.Sprintf("Model updated to %s but failed to save: %v", arg, err)
		}
	}
	return fmt.Sprintf("Model switched to: %s", arg)
}
