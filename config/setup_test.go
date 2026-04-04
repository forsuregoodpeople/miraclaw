package config_test

import (
	"testing"

	"github.com/miraclaw/config"
)

func TestProviderDefaultModel(t *testing.T) {
	cases := []struct {
		provider string
		want     string
	}{
		{"openai", "gpt-4o-mini"},
		{"deepseek", "deepseek-chat"},
		{"anthropic", "claude-haiku-4-5-20251001"},
		{"gemini", "gemini-2.0-flash"},
		{"unknown", ""},
	}
	for _, tc := range cases {
		got := config.ProviderDefaultModel(tc.provider)
		if got != tc.want {
			t.Errorf("ProviderDefaultModel(%q) = %q, want %q", tc.provider, got, tc.want)
		}
	}
}

func TestDefaultConfigValues(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.Qdrant.Host != "localhost" {
		t.Errorf("expected localhost, got %s", cfg.Qdrant.Host)
	}
	if cfg.Qdrant.Port != 6334 {
		t.Errorf("expected port 6334, got %d", cfg.Qdrant.Port)
	}
	if cfg.Agent.MaxOutputTokens != 1024 {
		t.Errorf("expected 1024 max output tokens, got %d", cfg.Agent.MaxOutputTokens)
	}
	if cfg.Embedder.Provider != "openai" {
		t.Errorf("expected openai embedder, got %s", cfg.Embedder.Provider)
	}
}
