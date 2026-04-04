package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Telegram struct {
	PairingID    string `yaml:"pairing_id"`
	Token        string `yaml:"token"`
	PairedChatID int64  `yaml:"paired_chat_id"` // 0 = not paired yet
}

type Qdrant struct {
	Host       string `yaml:"host"`
	Port       int    `yaml:"port"`
	Collection string `yaml:"collection"`
}

type Agent struct {
	SystemPrompt       string `yaml:"system_prompt"`
	MaxContextMessages int    `yaml:"max_context_messages"`
	MaxHistoryTurns    int    `yaml:"max_history_turns"`
	MaxMessageLen      int    `yaml:"max_message_len"`
	MaxOutputTokens    int    `yaml:"max_output_tokens"`
	MaxSummaryLen      int    `yaml:"max_summary_len"`
	MaxInputLen        int    `yaml:"max_input_len"`
	MaxSkillDescLen    int    `yaml:"max_skill_desc_len"`
}

type Security struct {
	EncryptionKey string `yaml:"encryption_key"` // optional passphrase for AES-256-GCM memory encryption
}

// LLMProvider adalah salah satu: "openai", "deepseek", "anthropic"
type LLMConfig struct {
	Provider string `yaml:"provider"`
	APIKey   string `yaml:"api_key"`
	Model    string `yaml:"model"`
}

type EmbedderConfig struct {
	Provider string `yaml:"provider"` // "openai" (default) | "gemini"
	APIKey   string `yaml:"api_key"`
}

type Config struct {
	Telegram Telegram       `yaml:"telegram"`
	Qdrant   Qdrant         `yaml:"qdrant"`
	Agent    Agent          `yaml:"agent"`
	LLM      LLMConfig      `yaml:"llm"`
	Embedder EmbedderConfig `yaml:"embedder"`
	Security Security       `yaml:"security"`
}

func DefaultConfig() *Config {
	return &Config{
		Qdrant: Qdrant{
			Host:       "localhost",
			Port:       6334,
			Collection: "miraclaw_memory",
		},
		Agent: Agent{
			MaxContextMessages: 2,
			MaxHistoryTurns:    6,
			MaxMessageLen:      120,
			MaxOutputTokens:    1024,
			MaxSummaryLen:      200,
			MaxInputLen:        400,
			MaxSkillDescLen:    40,
		},
		Embedder: EmbedderConfig{
			Provider: "openai",
		},
	}
}

// Save persists cfg to ~/.miraclaw/config.yaml.
func Save(cfg *Config) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("could not find home dir: %w", err)
	}
	dir := filepath.Join(home, ".miraclaw")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	path := filepath.Join(dir, "config.yaml")
	return os.WriteFile(path, data, 0600)
}

func Load() (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("could not find home dir: %w", err)
	}

	path := filepath.Join(home, ".miraclaw", "config.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("could not read config at %s: %w", path, err)
	}

	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("could not parse config: %w", err)
	}

	return cfg, nil
}
