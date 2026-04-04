package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/huh"
	"gopkg.in/yaml.v3"
)

func RunSetup(cfg *Config) error {
	fmt.Println("┌─────────────────────────────────┐")
	fmt.Println("│       MiraClaw  Setup           │")
	fmt.Println("└─────────────────────────────────┘")
	fmt.Println()

	// ── Step 1: Telegram ──────────────────────────────────────────────────────
	var token, pairingID string
	err := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("Telegram Bot Token").
				Description("Get it from @BotFather on Telegram.").
				EchoMode(huh.EchoModePassword).
				Value(&token),
			huh.NewInput().
				Title("Telegram Pairing ID").
				Description("Leave blank to skip.").
				Value(&pairingID),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Telegram.Token = token
	cfg.Telegram.PairingID = pairingID

	// ── Step 2: LLM Provider ─────────────────────────────────────────────────
	var llmProvider string
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("LLM Provider").
				Options(
					huh.NewOption("OpenAI (GPT-4o, o3, etc.)", "openai"),
					huh.NewOption("Anthropic (Claude)", "anthropic"),
					huh.NewOption("DeepSeek", "deepseek"),
					huh.NewOption("Google Gemini", "gemini"),
				).
				Value(&llmProvider),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.LLM.Provider = llmProvider

	// ── Step 3: LLM API Key & Model ──────────────────────────────────────────
	var llmKey, llmModel string
	defaultModel := ProviderDefaultModel(llmProvider)
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("LLM API Key").
				EchoMode(huh.EchoModePassword).
				Value(&llmKey),
			huh.NewInput().
				Title("Model").
				Description(fmt.Sprintf("Leave blank to use default: %s", defaultModel)).
				Placeholder(defaultModel).
				Value(&llmModel),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.LLM.APIKey = llmKey
	if llmModel != "" {
		cfg.LLM.Model = llmModel
	} else {
		cfg.LLM.Model = defaultModel
	}

	// ── Step 4: Embedder ─────────────────────────────────────────────────────
	var embedProvider string
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Embedder Provider").
				Description("Used for semantic memory. Same as LLM provider is fine.").
				Options(
					huh.NewOption("OpenAI (text-embedding-3-small)", "openai"),
					huh.NewOption("Google Gemini (gemini-embedding-001)", "gemini"),
				).
				Value(&embedProvider),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Embedder.Provider = embedProvider

	if embedProvider != llmProvider {
		var embedKey string
		err = huh.NewForm(
			huh.NewGroup(
				huh.NewInput().
					Title("Embedder API Key").
					Description("Leave blank to reuse the LLM API key.").
					EchoMode(huh.EchoModePassword).
					Value(&embedKey),
			),
		).Run()
		if err != nil {
			return err
		}
		cfg.Embedder.APIKey = embedKey
	}

	// ── Step 5: Agent Persona ────────────────────────────────────────────────
	var systemPrompt string
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewText().
				Title("Agent System Prompt (optional)").
				Description("Defines the agent's persona. Leave blank to skip.").
				CharLimit(500).
				Value(&systemPrompt),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Agent.SystemPrompt = systemPrompt

	// ── Step 6: Memory Encryption ────────────────────────────────────────────
	var encryptMemory bool
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Title("Enable memory encryption?").
				Description("Encrypts all text stored in Qdrant with AES-256-GCM.").
				Value(&encryptMemory),
		),
	).Run()
	if err != nil {
		return err
	}

	if encryptMemory {
		var encKey string
		err = huh.NewForm(
			huh.NewGroup(
				huh.NewInput().
					Title("Encryption Passphrase").
					Description("Used to derive the AES-256 key. Keep this safe.").
					EchoMode(huh.EchoModePassword).
					Value(&encKey),
			),
		).Run()
		if err != nil {
			return err
		}
		cfg.Security.EncryptionKey = encKey
	}

	return save(cfg)
}

// ProviderDefaultModel returns the default model name for the given provider.
// Exported so it can be tested.
func ProviderDefaultModel(provider string) string {
	switch provider {
	case "openai":
		return "gpt-4o-mini"
	case "deepseek":
		return "deepseek-chat"
	case "anthropic":
		return "claude-haiku-4-5-20251001"
	case "gemini":
		return "gemini-2.0-flash"
	default:
		return ""
	}
}

func save(cfg *Config) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	dir := filepath.Join(home, ".miraclaw")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, data, 0600); err != nil {
		return err
	}

	fmt.Printf("\n✓ Config saved to %s\n\n", path)
	return nil
}
