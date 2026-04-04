package channels

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/security"
)

// sessionCloser is satisfied by *orchestra.Memory.
type sessionCloser interface {
	CloseSession(ctx context.Context, channelID string) error
}

// PairingHandler enforces the pairing gate before messages reach the agent.
// It is safe for concurrent use.
type PairingHandler struct {
	mu           sync.Mutex
	pairingCode  string
	pairedChatID int64
	onPaired     func(chatID int64) error // called once on successful pairing
}

// NewPairingHandler creates a PairingHandler.
// pairedChatID = 0 means not yet paired.
// onPaired may be nil if persistence is not needed.
func NewPairingHandler(code string, pairedChatID int64, onPaired func(int64) error) *PairingHandler {
	return &PairingHandler{
		pairingCode:  code,
		pairedChatID: pairedChatID,
		onPaired:     onPaired,
	}
}

// Handle checks the pairing gate for an incoming message.
// Returns (reply, handled):
//   - handled=true  → caller must send reply (may be empty = silent block)
//   - handled=false → message passed the gate, route to agent normally
func (p *PairingHandler) Handle(_ context.Context, chatID int64, text string) (reply string, handled bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.pairedChatID == 0 {
		// Not paired yet — only accept the correct code
		if strings.TrimSpace(text) != p.pairingCode {
			return "Send pairing code to activate.", true
		}
		// Correct code — pair this chat
		p.pairedChatID = chatID
		if p.onPaired != nil {
			if err := p.onPaired(chatID); err != nil {
				log.Printf("warn: onPaired callback: %v", err)
			}
		}
		return "✓ Paired successfully.", true
	}

	// Already paired — only the owner passes through
	if chatID != p.pairedChatID {
		return "", true // silent block
	}
	return "", false // pass through to agent
}

// IsPaired reports whether a chat has been paired.
func (p *PairingHandler) IsPaired() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.pairedChatID != 0
}

// ── TelegramChannel ───────────────────────────────────────────────────────────

type TelegramChannel struct {
	TelegramPairingID string
	TelegramToken     string
	agent             *orchestra.Agent
	bot               *bot.Bot
	limiter           *security.RateLimiter
	memory            sessionCloser
	pairing           *PairingHandler // nil = pairing disabled
	activeSessions    map[string]struct{}
	commands          *CommandHandler
}

// deleteWebhook calls Telegram's deleteWebhook endpoint before starting polling.
// This clears any active webhook and drops pending long-poll conflicts.
func deleteWebhook(token string) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/deleteWebhook?drop_pending_updates=false", token)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[TGBOT] deleteWebhook: %v", err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

func NewTelegramChannel(pairingID, token string, agent *orchestra.Agent, limiter *security.RateLimiter) (*TelegramChannel, error) {
	ch := &TelegramChannel{
		TelegramPairingID: pairingID,
		TelegramToken:     token,
		agent:             agent,
		limiter:           limiter,
		activeSessions:    make(map[string]struct{}),
	}

	// Clear any stale webhook or long-poll conflict before connecting.
	deleteWebhook(token)

	b, err := bot.New(token,
		bot.WithDefaultHandler(ch.handleUpdate),
		bot.WithCheckInitTimeout(15*time.Second),
	)
	if err != nil {
		return nil, err
	}

	ch.bot = b
	return ch, nil
}

// SetMemory attaches a memory store so sessions are cleaned up on shutdown.
func (c *TelegramChannel) SetMemory(m sessionCloser) {
	c.memory = m
}

// SetPairing enables the pairing gate.
func (c *TelegramChannel) SetPairing(p *PairingHandler) {
	c.pairing = p
}

// SetCommands enables slash command handling.
func (c *TelegramChannel) SetCommands(h *CommandHandler) {
	c.commands = h
}

func (c *TelegramChannel) Start(ctx context.Context) {
	go func() {
		<-ctx.Done()
		if c.memory == nil {
			return
		}
		cleanCtx := context.Background()
		for channelID := range c.activeSessions {
			if err := c.memory.CloseSession(cleanCtx, channelID); err != nil {
				log.Printf("warn: close session %s: %v", channelID, err)
			}
		}
		log.Printf("Sessions closed: %d", len(c.activeSessions))
	}()
	c.bot.Start(ctx)
}

func SplitBubbles(text string, maxLen int) []string {
	var out []string
	for _, part := range strings.Split(text, "\n\n") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		for len(part) > maxLen {
			out = append(out, part[:maxLen])
			part = part[maxLen:]
		}
		if part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		out = append(out, strings.TrimSpace(text))
	}
	return out
}

func (c *TelegramChannel) PairingID() string {
	return c.TelegramPairingID
}

func (c *TelegramChannel) handleUpdate(ctx context.Context, b *bot.Bot, update *models.Update) {
	if update.Message == nil {
		return
	}

	chatID := update.Message.Chat.ID
	channelID := fmt.Sprintf("%d", chatID)

	// Pairing gate — runs before rate limiter and agent
	if c.pairing != nil {
		reply, handled := c.pairing.Handle(ctx, chatID, update.Message.Text)
		if handled {
			if reply != "" {
				if _, err := b.SendMessage(ctx, &bot.SendMessageParams{
					ChatID: chatID,
					Text:   reply,
				}); err != nil {
					log.Printf("send pairing reply failed: %v", err)
				}
			}
			return
		}
	}

	// Command routing — bypass rate limiter
	if c.commands != nil && strings.HasPrefix(update.Message.Text, "/") {
		reply := c.commands.HandleWithChannel(ctx, update.Message.Text, channelID)
		if _, err := b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: chatID,
			Text:   reply,
		}); err != nil {
			log.Printf("send command reply failed: %v", err)
		}
		return
	}

	if c.limiter != nil {
		if err := c.limiter.Allow(channelID); err != nil {
			if _, sendErr := b.SendMessage(ctx, &bot.SendMessageParams{
				ChatID: chatID,
				Text:   "Too many requests. Please slow down.",
			}); sendErr != nil {
				log.Printf("send rate-limit reply failed: %v", sendErr)
			}
			return
		}
	}

	c.activeSessions[channelID] = struct{}{}

	msg := orchestra.NewMessage(
		fmt.Sprintf("%d", update.Message.ID),
		update.Message.Text,
		channelID,
	)

	if _, err := b.SendChatAction(ctx, &bot.SendChatActionParams{
		ChatID: chatID,
		Action: models.ChatActionTyping,
	}); err != nil {
		log.Printf("send typing action failed: %v", err)
	}

	reply, err := c.agent.Reply(ctx, msg)
	if err != nil {
		log.Printf("agent reply error: %v", err)
		if _, sendErr := b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: chatID,
			Text:   "Sorry, I encountered an error. Please try again.",
		}); sendErr != nil {
			log.Printf("send error message failed: %v", sendErr)
		}
		return
	}

	bubbles := SplitBubbles(reply, 4096)
	for i, bubble := range bubbles {
		if i > 0 {
			if _, err := b.SendChatAction(ctx, &bot.SendChatActionParams{
				ChatID: chatID,
				Action: models.ChatActionTyping,
			}); err != nil {
				log.Printf("send typing action failed: %v", err)
			}
			time.Sleep(300 * time.Millisecond)
		}
		if _, sendErr := b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID:    chatID,
			Text:      bubble,
			ParseMode: models.ParseModeMarkdownV1,
		}); sendErr != nil {
			log.Printf("send bubble failed (chatID %d): %v", chatID, sendErr)
			break
		}
	}
}

// SendBubbles sends text to chatID split into multi-bubble messages with typing
// delays, reusing the same delivery path as handleUpdate. Safe for concurrent use.
func (c *TelegramChannel) SendBubbles(ctx context.Context, chatID int64, text string) error {
	bubbles := SplitBubbles(text, 4096)
	for i, bubble := range bubbles {
		if i > 0 {
			if _, err := c.bot.SendChatAction(ctx, &bot.SendChatActionParams{
				ChatID: chatID,
				Action: models.ChatActionTyping,
			}); err != nil {
				log.Printf("[scheduler] send typing action failed: %v", err)
			}
			time.Sleep(300 * time.Millisecond)
		}
		if _, err := c.bot.SendMessage(ctx, &bot.SendMessageParams{
			ChatID:    chatID,
			Text:      bubble,
			ParseMode: models.ParseModeMarkdownV1,
		}); err != nil {
			return fmt.Errorf("send bubble to %d: %w", chatID, err)
		}
	}
	return nil
}
