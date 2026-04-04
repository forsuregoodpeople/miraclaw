package channels

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/miraclaw/orchestra"
)

// BotConfig holds runtime-mutable bot configuration exposed to CommandHandler.
type BotConfig struct {
	Provider string
	Model    string
	BotName  string
}

// MemoryUpdater is the minimal interface needed by CommandHandler for memory commands.
type MemoryUpdater interface {
	AddStatic(ctx context.Context, id, text, category string) error
	GetStaticByCategory(ctx context.Context, category string) ([]*orchestra.Message, error)
	ClearAll(ctx context.Context) error
}

// CommandHandler handles bot slash commands independently of Telegram transport.
// It is safe for concurrent use as long as the caller manages BotConfig mutations.
type CommandHandler struct {
	cfg     *BotConfig
	closeFn func(ctx context.Context, channelID string) error // for /new, /clear
	saveFn  func(model string) error                          // for /model <name>
	listFn  func(ctx context.Context) ([]string, error)       // for /model (list)
	mem     MemoryUpdater                                      // for /remember, /identity, /forget
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

// SetMemory wires a MemoryUpdater to enable /remember, /identity, and /forget commands.
func (h *CommandHandler) SetMemory(mem MemoryUpdater) {
	h.mem = mem
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
		return h.handleStart(ctx, channelID)
	case "help":
		return h.handleHelp()
	case "new", "clear":
		return h.handleNew(ctx, channelID)
	case "status":
		return h.handleStatus()
	case "model":
		return h.handleModel(ctx, arg)
	case "remember":
		return h.handleRemember(ctx, arg)
	case "identity":
		return h.handleIdentity(ctx, arg)
	case "forget":
		return h.handleForget(ctx)
	default:
		return fmt.Sprintf("Unknown command: /%s\nSend /help for the list of available commands.", cmd)
	}
}

func (h *CommandHandler) handleStart(ctx context.Context, channelID string) string {
	// Clear session on /start to ensure fresh conversation
	if h.closeFn != nil && channelID != "" {
		if err := h.closeFn(ctx, channelID); err != nil {
			log.Printf("warn: /start clear session failed: %v", err)
			// Continue anyway - don't block the start command
		}
	}
	
	name := h.cfg.BotName
	if name == "" {
		name = "your AI assistant"
	}
	return fmt.Sprintf("Hello! I'm %s 👋\n\nSend me a message to start chatting. Use /help to see available commands.", name)
}

func (h *CommandHandler) handleHelp() string {
	var b strings.Builder
	b.WriteString("Commands:\n")
	b.WriteString("  /start    — show this welcome message\n")
	b.WriteString("  /new      — start a new conversation (clear history)\n")
	b.WriteString("  /clear    — alias for /new\n")
	b.WriteString("  /status   — show bot status (provider, model)\n")
	b.WriteString("  /model    — list available models\n")
	b.WriteString("  /model <name> — switch to a different model\n")
	b.WriteString("  /remember <text> — save something to memory\n")
	b.WriteString("  /identity <field>:<value> — update identity (e.g. name:Sara, language:Indonesian)\n")
	b.WriteString("  /forget   — wipe all memory\n")
	b.WriteString("  /help     — show this message")
	return b.String()
}

func (h *CommandHandler) handleRemember(ctx context.Context, text string) string {
	if h.mem == nil {
		return "Memory not available."
	}
	if text == "" {
		return "Usage: /remember <text>"
	}
	id := fmt.Sprintf("mem-%d", time.Now().UnixNano())
	if err := h.mem.AddStatic(ctx, id, text, "user"); err != nil {
		return "Gagal simpan: " + err.Error()
	}
	return "✓ Tersimpan: " + text
}

func (h *CommandHandler) handleIdentity(ctx context.Context, input string) string {
	if h.mem == nil {
		return "Memory not available."
	}
	if input == "" {
		return "Usage: /identity <field>:<value> — contoh: /identity name:Sara"
	}
	result, err := orchestra.UpdateIdentity(ctx, h.mem, input)
	if err != nil {
		return "Gagal update identity: " + err.Error()
	}
	return "✓ Identity diupdate: " + result
}

func (h *CommandHandler) handleForget(ctx context.Context) string {
	if h.mem == nil {
		return "Memory not available."
	}
	if err := h.mem.ClearAll(ctx); err != nil {
		return "Gagal hapus memory: " + err.Error()
	}
	return "✓ Semua memory dihapus."
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
