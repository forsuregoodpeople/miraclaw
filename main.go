package main

import (
	"context"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"time"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/channels"
	"github.com/miraclaw/orchestra/embedders"
	"github.com/miraclaw/orchestra/providers"
	"github.com/miraclaw/orchestra/scheduler"
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
		case "--detach":
			// Re-launch without --detach as a detached background process
			args := make([]string, 0, len(os.Args)-1)
			for _, a := range os.Args[1:] {
				if a != "--detach" {
					args = append(args, a)
				}
			}
			cmd := exec.Command(os.Args[0], args...)
			cmd.Stdin = nil
			cmd.Stdout = nil
			cmd.Stderr = nil
			if err := cmd.Start(); err != nil {
				log.Fatalf("detach: %v", err)
			}
			log.Printf("Detached as PID %d", cmd.Process.Pid)
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

	var agentMem orchestra.AgentMemory
	mem, memErr := orchestra.NewMemory(cfg.Qdrant.Host, cfg.Qdrant.Port, orchestra.MemoryCollections{
		Session:   cfg.Qdrant.CollectionSession,
		ShortTerm: cfg.Qdrant.CollectionShortTerm,
		LongTerm:  cfg.Qdrant.CollectionLongTerm,
		Static:    cfg.Qdrant.CollectionStatic,
	}, embedder)
	if memErr != nil {
		log.Printf("warn: qdrant unavailable, running without memory: %v", memErr)
		agentMem = &orchestra.NoOpMemory{}
	} else {
		agentMem = mem
		mem.SetShortTermTTL(cfg.Agent.ShortTermTTLDays)

		// Bootstrap: Load markdown files from workspace into Qdrant (token-efficient)
		bootstrap := orchestra.NewBootstrap(mem, "./workspace")
		bootstrapResult, err := bootstrap.Run(ctx)
		if err != nil {
			log.Printf("warn: bootstrap failed: %v", err)
		} else if bootstrapResult.AlreadyBootstrapped {
			if bootstrapResult.HashMatch {
				log.Printf("Bootstrap: up to date (%d sections)", bootstrapResult.SectionsStored)
			} else {
				log.Printf("Bootstrap: updated (%d files, %d sections)",
					bootstrapResult.FilesProcessed, bootstrapResult.SectionsStored)
			}
		} else {
			log.Printf("Bootstrap: loaded %d files, %d sections",
				bootstrapResult.FilesProcessed, bootstrapResult.SectionsStored)
		}

		// Seed identity if not exists
		orchestra.SeedIdentity(ctx, mem, cfg.Agent.BotName)

		// Seed built-in knowledge (skill usage, examples, scheduling)
		orchestra.SeedKnowledge(ctx, mem)

		// Load optional user-provided knowledge file
		if cfg.Agent.AgentMD != "" {
			if err := orchestra.LoadKnowledgeFile(ctx, cfg.Agent.AgentMD, mem); err != nil {
				log.Printf("warn: knowledge file: %v", err)
			}
		}

		// Flush pending system_prompt from setup wizard into Qdrant static, then clear it from config
		if cfg.Agent.SystemPrompt != "" {
			if err := mem.AddStatic(ctx, "setup-persona", cfg.Agent.SystemPrompt, "agentmd"); err != nil {
				log.Printf("warn: flush system_prompt to qdrant: %v", err)
			} else {
				log.Printf("Persona flushed to Qdrant static knowledge")
				cfg.Agent.SystemPrompt = ""
				if err := config.Save(cfg); err != nil {
					log.Printf("warn: save config after persona flush: %v", err)
				}
			}
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
		Requests: 50,
		Window:   time.Minute,
	})

	sys := orchestra.NewSystem(orchestra.SystemConfig{
		URLValidator: security.ValidateURL,
	})

	skills.RegisterExecSkill(sys)
	skills.RegisterConfirmSudoSkill(sys)
	if mem != nil {
		skills.RegisterMemorySkills(sys, mem)
	} else {
		skills.RegisterMemorySkills(sys, &orchestra.NoOpMemory{})
	}

	agent := orchestra.NewAgent(agentMem, provider, sys, orchestra.AgentConfig{
		BotName:            cfg.Agent.BotName,
		SystemPrompt:       cfg.Agent.SystemPrompt,
		MaxContextMessages: cfg.Agent.MaxContextMessages,
		MaxHistoryTurns:    cfg.Agent.MaxHistoryTurns,
		MaxMessageLen:      cfg.Agent.MaxMessageLen,
		MaxOutputTokens:    cfg.Agent.MaxOutputTokens,
		MaxSummaryLen:      cfg.Agent.MaxSummaryLen,
		MaxInputLen:        cfg.Agent.MaxInputLen,
		MaxSkillDescLen:    cfg.Agent.MaxSkillDescLen,
		ContextWindow:      cfg.Agent.ContextWindow,
		ShortTermTTLDays:   cfg.Agent.ShortTermTTLDays,
		TextScanner:        security.ScanText,
	})

	ch, err := channels.NewTelegramChannel(cfg.Telegram.PairingID, cfg.Telegram.Token, agent, limiter)
	if err != nil {
		log.Fatalf("telegram: %v", err)
	}
	ch.SetMemory(agentMem)

	botCfg := &channels.BotConfig{
		Provider: cfg.LLM.Provider,
		Model:    cfg.LLM.Model,
		BotName:  cfg.Agent.BotName,
	}
	var listFn func(ctx context.Context) ([]string, error)
	if ml, ok := rawProvider.(orchestra.ModelLister); ok {
		listFn = ml.ListModels
	}
	cmdHandler := channels.NewCommandHandler(
		botCfg,
		func(ctx context.Context, channelID string) error {
			return agentMem.CloseSession(ctx, channelID)
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
	// Set memory for command handler (use concrete type *Memory, not interface)
	if mem != nil {
		cmdHandler.SetMemory(mem)
	} else {
		cmdHandler.SetMemory(&orchestra.NoOpMemory{})
	}
	ch.SetCommands(cmdHandler)

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

	sched := scheduler.New(cfg.Schedule.Rules, agent, ch)

	schedSaveFn := func() error {
		cfg.Schedule.Rules = sched.Rules()
		return config.Save(cfg)
	}
	skills.RegisterScheduleSkills(sys, sched, cfg.Telegram.PairedChatID, schedSaveFn)
	skills.RegisterPlanSkills(sys, agentMem)

	sched.Start(ctx)

	log.Printf("Bot started [llm:%s model:%s]", cfg.LLM.Provider, cfg.LLM.Model)
	ch.Start(ctx)
}

// embedderProviderSupportsEmbedding reports whether the given LLM provider
// has its own embedding API. DeepSeek and Anthropic do not.
func embedderProviderSupportsEmbedding(provider string) bool {
	switch provider {
	case "openai", "gemini":
		return true
	default:
		return false
	}
}

// useLocalEmbedder reports whether to use local hash-based embedder.
// This is used when no API key is available for embedding providers.
func useLocalEmbedder(provider string) bool {
	switch provider {
	case "deepseek", "anthropic":
		return true
	default:
		return false
	}
}

func resolveEmbedderProviderAndKey(cfg *config.Config) (provider, key string) {
	// If no explicit embedder provider, auto-detect from LLM provider.
	provider = cfg.Embedder.Provider
	if provider == "" {
		if embedderProviderSupportsEmbedding(cfg.LLM.Provider) {
			provider = cfg.LLM.Provider
		} else if useLocalEmbedder(cfg.LLM.Provider) {
			// deepseek/anthropic → use local hash-based embedder (no API key needed)
			provider = "local"
		} else {
			// fallback ke openai for other providers
			provider = "openai"
		}
	}

	// Use explicit embedder key if set AND it belongs to the resolved provider
	// (i.e. not a stale key from a different provider copied into embedder.api_key).
	// Heuristic: DeepSeek keys start with "sk-" but are not valid for OpenAI.
	// If embedder provider != LLM provider, only trust embedder.api_key if it
	// was explicitly set different from the LLM key.
	key = cfg.Embedder.APIKey
	if key == cfg.LLM.APIKey && provider != cfg.LLM.Provider && provider != "local" {
		// embedder.api_key is just a copy of the LLM key — useless for a
		// different provider (e.g. DeepSeek key sent to OpenAI). Clear it.
		key = ""
	}
	if key == "" && provider == cfg.LLM.Provider {
		key = cfg.LLM.APIKey
	}
	if key == "" && provider != "local" {
		log.Printf("warn: embedder provider %q requires an API key — set embedder.api_key in ~/.miraclaw/config.yaml or run --setup", provider)
	}
	return provider, key
}

func buildEmbedder(cfg *config.Config) (orchestra.Embedder, error) {
	provider, key := resolveEmbedderProviderAndKey(cfg)
	switch provider {
	case "gemini":
		return embedders.NewGeminiEmbedder(key)
	case "local":
		return embedders.NewLocalEmbedder(), nil
	default:
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
