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
		switch arg {
		case "--setup":
			cfg, _ := config.Load()
			if cfg == nil {
				cfg = config.DefaultConfig()
			}
			if err := config.RunSetup(cfg); err != nil {
				log.Fatalf("setup: %v", err)
			}
			os.Exit(0)
		case "--pairing":
			cfg, err := config.Load()
			if err != nil {
				log.Fatalf("config: %v", err)
			}
			if err := config.RunPairingSetup(cfg); err != nil {
				log.Fatalf("pairing: %v", err)
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

	mem, err := orchestra.NewMemory(cfg.Qdrant.Host, cfg.Qdrant.Port, orchestra.MemoryCollections{
		Session:   cfg.Qdrant.CollectionSession,
		ShortTerm: cfg.Qdrant.CollectionShortTerm,
		LongTerm:  cfg.Qdrant.CollectionLongTerm,
		Static:    cfg.Qdrant.CollectionStatic,
	}, embedder)
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

	rawProvider, err := buildLLM(cfg)
	if err != nil {
		log.Fatalf("llm: %v", err)
	}
	if rawProvider == nil {
		log.Fatalf("llm provider not configured — run --setup to set llm.provider")
	}
	provider := orchestra.NewSwappableLLM(rawProvider)

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
	skills.RegisterMemorySkills(sys, mem)

	// Optional: tambahkan search skill sesuai kebutuhan.
	// Contoh dengan DuckDuckGo bawaan (butuh TLS cert yang valid):
	//   sys.Register("websearch", "search the web: input is the query", func(ctx context.Context, input string) (string, error) {
	//       return skills.WebSearch(ctx, input)
	//   })
	// Atau dengan provider lain (SearxNG, Brave, dll):
	//   sys.Register("websearch", "search the web: input is the query", mySearchHandler)

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

	// Setup command handler
	botCfg := &channels.BotConfig{
		Provider: cfg.LLM.Provider,
		Model:    cfg.LLM.Model,
	}
	var listFn func(ctx context.Context) ([]string, error)
	if ml, ok := rawProvider.(orchestra.ModelLister); ok {
		listFn = ml.ListModels
	}
	cmdHandler := channels.NewCommandHandler(
		botCfg,
		func(ctx context.Context, channelID string) error {
			return mem.CloseSession(ctx, channelID)
		},
		func(model string) error {
			cfg.LLM.Model = model
			botCfg.Model = model
			newLLM, err := buildLLM(cfg)
			if err != nil {
				return err
			}
			provider.Swap(newLLM)
			return config.Save(cfg)
		},
		listFn,
	)
	ch.SetCommands(cmdHandler)

	// Enable pairing gate if a pairing code is configured
	if cfg.Telegram.PairingID != "" {
		pairing := channels.NewPairingHandler(
			cfg.Telegram.PairingID,
			cfg.Telegram.PairedChatID,
			func(chatID int64) error {
				cfg.Telegram.PairedChatID = chatID
				return config.Save(cfg)
			},
		)
		ch.SetPairing(pairing)
		if cfg.Telegram.PairedChatID == 0 {
			log.Printf("Pairing required — send code to bot to activate")
		} else {
			log.Printf("Paired with chat ID: %d", cfg.Telegram.PairedChatID)
		}
	}

	log.Printf("Bot started [llm:%s model:%s]", cfg.LLM.Provider, cfg.LLM.Model)
	ch.Start(ctx)
}

func buildEmbedder(cfg *config.Config) (orchestra.Embedder, error) {
	key := cfg.Embedder.APIKey
	if key == "" {
		key = cfg.LLM.APIKey
	}
	provider := cfg.Embedder.Provider
	if provider == "" {
		provider = cfg.LLM.Provider
	}
	switch provider {
	case "gemini":
		return embedders.NewGeminiEmbedder(key)
	default: // "openai", "deepseek", "anthropic" all use OpenAI-compatible embeddings
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
