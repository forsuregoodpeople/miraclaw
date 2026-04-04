package channels

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/security"
)

// sessionCloser is satisfied by *orchestra.Memory.
type sessionCloser interface {
	CloseSession(ctx context.Context, channelID string) error
}

type TelegramChannel struct {
	TelegramPairingID string
	TelegramToken     string
	agent             *orchestra.Agent
	bot               *bot.Bot
	limiter           *security.RateLimiter // nil = disabled
	memory            sessionCloser         // optional: close sessions on shutdown
	activeSessions    map[string]struct{}
}

func NewTelegramChannel(pairingID, token string, agent *orchestra.Agent, limiter *security.RateLimiter) (*TelegramChannel, error) {
	ch := &TelegramChannel{
		TelegramPairingID: pairingID,
		TelegramToken:     token,
		agent:             agent,
		limiter:           limiter,
		activeSessions:    make(map[string]struct{}),
	}

	b, err := bot.New(token, bot.WithDefaultHandler(ch.handleUpdate))
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

func (c *TelegramChannel) Start(ctx context.Context) {
	// Close all active sessions when context is cancelled (shutdown).
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

func (c *TelegramChannel) PairingID() string {
	return c.TelegramPairingID
}

func (c *TelegramChannel) handleUpdate(ctx context.Context, b *bot.Bot, update *models.Update) {
	if update.Message == nil {
		return
	}

	channelID := fmt.Sprintf("%d", update.Message.Chat.ID)

	if c.limiter != nil {
		if err := c.limiter.Allow(channelID); err != nil {
			b.SendMessage(ctx, &bot.SendMessageParams{
				ChatID: update.Message.Chat.ID,
				Text:   "Too many requests. Please slow down.",
			})
			return
		}
	}

	c.activeSessions[channelID] = struct{}{}

	msg := orchestra.NewMessage(
		fmt.Sprintf("%d", update.Message.ID),
		update.Message.Text,
		channelID,
	)

	reply, err := c.agent.Reply(ctx, msg)
	if err != nil {
		log.Printf("agent reply error: %v", err)
		return
	}

	const maxLen = 4096
	for len(reply) > 0 {
		chunk := reply
		if len(chunk) > maxLen {
			cut := maxLen
			if i := strings.LastIndex(reply[:maxLen], "\n"); i > 0 {
				cut = i + 1
			}
			chunk = reply[:cut]
			reply = reply[cut:]
		} else {
			reply = ""
		}
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   chunk,
		})
	}
}
