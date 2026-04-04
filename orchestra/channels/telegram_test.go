package channels_test

import (
	"context"
	"testing"

	"github.com/miraclaw/orchestra/channels"
)

func TestPairingFlow(t *testing.T) {
	var pairedChatID int64
	onPaired := func(chatID int64) error {
		pairedChatID = chatID
		return nil
	}

	ch := channels.NewPairingHandler("secret123", 0, onPaired)

	// Not paired yet — wrong code
	reply, handled := ch.Handle(context.Background(), 111, "hello")
	if !handled {
		t.Error("expected message to be handled (pairing gate)")
	}
	if reply != "Send pairing code to activate." {
		t.Errorf("expected activation prompt, got %q", reply)
	}
	if pairedChatID != 0 {
		t.Error("should not be paired yet")
	}

	// Not paired yet — correct code
	reply, handled = ch.Handle(context.Background(), 111, "secret123")
	if !handled {
		t.Error("expected message to be handled")
	}
	if reply != "✓ Paired successfully." {
		t.Errorf("expected success message, got %q", reply)
	}
	if pairedChatID != 111 {
		t.Errorf("expected pairedChatID 111, got %d", pairedChatID)
	}

	// Already paired — same chat ID → not handled by pairing gate (pass through)
	reply, handled = ch.Handle(context.Background(), 111, "some message")
	if handled {
		t.Error("expected message to pass through to agent after pairing")
	}

	// Already paired — different chat ID → silently blocked
	reply, handled = ch.Handle(context.Background(), 999, "some message")
	if !handled {
		t.Error("expected unauthorized message to be blocked")
	}
	if reply != "" {
		t.Errorf("expected silent block (empty reply), got %q", reply)
	}
}

func TestPairingAlreadyPaired(t *testing.T) {
	// Bot started with an existing pairedChatID (loaded from config)
	ch := channels.NewPairingHandler("secret123", 555, nil)

	// Correct owner — passes through
	_, handled := ch.Handle(context.Background(), 555, "hello")
	if handled {
		t.Error("expected owner message to pass through")
	}

	// Stranger — blocked silently
	reply, handled := ch.Handle(context.Background(), 999, "hello")
	if !handled {
		t.Error("expected stranger to be blocked")
	}
	if reply != "" {
		t.Errorf("expected empty reply for stranger, got %q", reply)
	}
}
