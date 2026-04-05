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

func TestDefaultConfigHasLLMModel(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.LLM.Model == "" {
		t.Error("DefaultConfig should set a default LLM model")
	}
	if cfg.LLM.Provider == "" {
		t.Error("DefaultConfig should set a default LLM provider")
	}
}

func TestTelegramStructHasPairedChatID(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Telegram.PairedChatID = 999
	if cfg.Telegram.PairedChatID != 999 {
		t.Error("PairedChatID field not accessible")
	}
}

func TestDefaultConfigMaxMessageLen(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.Agent.MaxMessageLen != 400 {
		t.Errorf("expected MaxMessageLen 400, got %d", cfg.Agent.MaxMessageLen)
	}
}

func TestDefaultConfigMaxContextMessages(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.Agent.MaxContextMessages != 10 {
		t.Errorf("expected MaxContextMessages 10, got %d", cfg.Agent.MaxContextMessages)
	}
}

func TestDefaultConfigShortTermTTLDays(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.Agent.ShortTermTTLDays != 7 {
		t.Errorf("expected ShortTermTTLDays 7, got %d", cfg.Agent.ShortTermTTLDays)
	}
}

func TestLoadConfigOldFileMissingShortTermTTL(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	// Write a config.yaml without short_term_ttl_days
	dir := filepath.Join(home, ".miraclaw")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	yaml := "agent:\n  bot_name: TestBot\n"
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(yaml), 0600); err != nil {
		t.Fatal(err)
	}

	loaded, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Agent.ShortTermTTLDays != 7 {
		t.Errorf("expected ShortTermTTLDays default 7 for old config, got %d", loaded.Agent.ShortTermTTLDays)
	}
}
