package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/miraclaw/config"
)

func TestSaveAndLoad(t *testing.T) {
	// Override home dir via a temp dir trick — Save uses os.UserHomeDir so we
	// write directly to a temp path and test round-trip via yaml marshal/unmarshal.
	cfg := config.DefaultConfig()
	cfg.Telegram.Token = "test-token"
	cfg.Telegram.PairedChatID = 123456789

	home := t.TempDir()
	t.Setenv("HOME", home)

	if err := config.Save(cfg); err != nil {
		t.Fatalf("Save: %v", err)
	}

	path := filepath.Join(home, ".miraclaw", "config.yaml")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("config file not created: %v", err)
	}

	loaded, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Telegram.Token != "test-token" {
		t.Errorf("expected token 'test-token', got %q", loaded.Telegram.Token)
	}
	if loaded.Telegram.PairedChatID != 123456789 {
		t.Errorf("expected PairedChatID 123456789, got %d", loaded.Telegram.PairedChatID)
	}
}

func TestTelegramStructHasPairedChatID(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Telegram.PairedChatID = 999
	if cfg.Telegram.PairedChatID != 999 {
		t.Error("PairedChatID field not accessible")
	}
}
