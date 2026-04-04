package channels

import (
	"context"
	"log"
	"strings"
	"sync"
)

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
