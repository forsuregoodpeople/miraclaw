package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/channels"
	"github.com/miraclaw/orchestra/embedders"
	"github.com/miraclaw/orchestra/providers"
	"github.com/miraclaw/orchestra/security"
	"github.com/miraclaw/orchestra/skills"
)

func init() {
	for _, arg := range os.Args[1:] {
		if arg == "--setup" {
			cfg, _ := config.Load()
			if cfg == nil {
				cfg = config.DefaultConfig()
			}
			if err := config.RunSetup(cfg); err != nil {
				log.Fatalf("setup: %v", err)
			}
			os.Exit(0)
		}
	}
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if cfg.Telegram.Token == "" {
		if err := config.RunSetup(cfg); err != nil {
			log.Fatalf("setup: %v", err)
		}
	}

	embedder, err := buildEmbedder(cfg)
	if err != nil {
		log.Fatalf("embedder: %v", err)
	}

	mem, err := orchestra.NewMemory(cfg.Qdrant.Host, cfg.Qdrant.Port, cfg.Qdrant.Collection, embedder)
	if err != nil {
		log.Fatalf("qdrant: %v", err)
	}

	// Activate memory encryption if passphrase is configured
	if cfg.Security.EncryptionKey != "" {
		enc, encErr := security.NewEncryptorFromPassphrase(cfg.Security.EncryptionKey)
		if encErr != nil {
			log.Fatalf("encryption init: %v", encErr)
		}
		mem.SetEncryptor(enc)
		log.Println("Memory encryption enabled")
	}

	provider, err := buildLLM(cfg)
	if err != nil {
		log.Fatalf("llm: %v", err)
	}

	limiter := security.NewRateLimiter(security.RateLimiterConfig{
		Requests: 10,
		Window:   time.Minute,
	})

	sys := orchestra.NewSystem(orchestra.SystemConfig{
		CmdValidator: security.ValidateCommand,
		URLValidator: security.ValidateURL,
	})

	// Register built-in skills
	skills.RegisterAll(sys)

	agent := orchestra.NewAgent(mem, provider, sys, orchestra.AgentConfig{
		SystemPrompt:       cfg.Agent.SystemPrompt,
		MaxContextMessages: cfg.Agent.MaxContextMessages,
		MaxHistoryTurns:    cfg.Agent.MaxHistoryTurns,
		MaxMessageLen:      cfg.Agent.MaxMessageLen,
		MaxOutputTokens:    cfg.Agent.MaxOutputTokens,
		MaxSummaryLen:      cfg.Agent.MaxSummaryLen,
		MaxInputLen:        cfg.Agent.MaxInputLen,
		MaxSkillDescLen:    cfg.Agent.MaxSkillDescLen,
		TextScanner:        security.ScanText,
	})

	ch, err := channels.NewTelegramChannel(cfg.Telegram.PairingID, cfg.Telegram.Token, agent, limiter)
	if err != nil {
		log.Fatalf("telegram: %v", err)
	}
	ch.SetMemory(mem)

	log.Printf("Bot started [llm:%s model:%s]", cfg.LLM.Provider, cfg.LLM.Model)
	ch.Start(ctx)
}

func buildEmbedder(cfg *config.Config) (orchestra.Embedder, error) {
	key := cfg.Embedder.APIKey
	if key == "" {
		key = cfg.LLM.APIKey
	}
	switch cfg.Embedder.Provider {
	case "gemini":
		return embedders.NewGeminiEmbedder(key)
	default: // "openai" dan fallback
		return embedders.NewOpenAIEmbedder(key), nil
	}
}

func buildLLM(cfg *config.Config) (orchestra.LLM, error) {
	key := cfg.LLM.APIKey
	model := cfg.LLM.Model

	switch cfg.LLM.Provider {
	case "openai":
		return providers.NewOpenAI(key, model), nil
	case "deepseek":
		return providers.NewDeepSeek(key, model), nil
	case "anthropic":
		return providers.NewAnthropic(key, model), nil
	case "gemini":
		return providers.NewGemini(key, model)
	default:
		log.Printf("warn: llm.provider %q unknown or not set, responses disabled", cfg.LLM.Provider)
		return nil, nil
	}
}
