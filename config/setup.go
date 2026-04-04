package config

import (
	"fmt"
	"os"

	"github.com/charmbracelet/huh"
)

func colorRGB(r, g, b int) string {
	return fmt.Sprintf("\033[38;2;%d;%d;%dm", r, g, b)
}

const resetColor = "\033[0m"

func printBanner() {
	colors := []struct{ r, g, b int }{
		{147, 51, 234}, // Purple
		{130, 60, 238},
		{110, 70, 240},
		{90, 82, 242},
		{72, 96, 244},
		{59, 113, 246},
		{59, 130, 246}, // Blue
	}

	lines := []string{
		"██   ██  ███████  ██████     ███     ██████  ██         ███    ██   ██",
		"███ ███    ███    ██   ██   ██ ██   ██       ██        ██ ██   ██   ██",
		"████████   ███    ██   ██  ██   ██  ██       ██       ██   ██  ██ █ ██",
		"██ █ ██    ███    ██████   ███████  ██       ██       ███████  ████████",
		"██   ██    ███    ██  ██   ██   ██  ██       ██       ██   ██  ██ █ ██",
		"██   ██    ███    ██   ██  ██   ██  ██       ██       ██   ██  ██   ██",
		"██   ██  ███████  ██   ██  ██   ██   ██████  ███████  ██   ██  ██   ██",
	}

	for lineIdx, line := range lines {
		colorIdx := (lineIdx * (len(colors) - 1)) / (len(lines) - 1)
		c := colors[colorIdx]
		color := colorRGB(c.r, c.g, c.b)
		for _, char := range line {
			if char == ' ' {
				fmt.Print(" ")
			} else {
				fmt.Printf("%s%c%s", color, char, resetColor)
			}
		}
		fmt.Println()
	}
	fmt.Println()
}

func RunSetup(cfg *Config) error {

	printBanner()

	// ── Confirm update if config already has a token ──────────────────────────
	if cfg.Telegram.Token != "" {
		var doUpdate bool
		err := huh.NewForm(
			huh.NewGroup(
				huh.NewConfirm().
					Title("Config already exists. Update it?").
					Description("Choose Yes to edit existing values, No to exit.").
					Value(&doUpdate),
			),
		).Run()
		if err != nil {
			return err
		}
		if !doUpdate {
			fmt.Println("Setup cancelled.")
			return nil
		}
	}

	// ── Step 1: Telegram ──────────────────────────────────────────────────────
	token := cfg.Telegram.Token
	err := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("Telegram Bot Token").
				Description("Get it from @BotFather on Telegram.").
				EchoMode(huh.EchoModePassword).
				Value(&token),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Telegram.Token = token

	// ── Step 2: LLM Provider ─────────────────────────────────────────────────
	llmProvider := cfg.LLM.Provider
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
	llmKey := cfg.LLM.APIKey
	llmModel := cfg.LLM.Model
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
	embedProvider := cfg.Embedder.Provider
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
		embedKey := cfg.Embedder.APIKey
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
	} else {
		cfg.Embedder.APIKey = llmKey
	}

	// ── Step 5: Agent Persona ────────────────────────────────────────────────
	systemPrompt := cfg.Agent.SystemPrompt
	err = huh.NewForm(
		huh.NewGroup(
			huh.NewText().
				Title("Agent Persona (optional)").
				Description("Defines the agent's identity. Saved to Qdrant static knowledge on next startup. Leave blank to skip.").
				CharLimit(500).
				Value(&systemPrompt),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Agent.SystemPrompt = systemPrompt

	// ── Step 6: Memory Encryption ────────────────────────────────────────────
	encryptMemory := cfg.Security.EncryptionKey != ""
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
		encKey := cfg.Security.EncryptionKey
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
	} else {
		cfg.Security.EncryptionKey = ""
	}

	if err := Save(cfg); err != nil {
		return err
	}
	home, _ := os.UserHomeDir()
	fmt.Printf("\n✓ Config saved to %s/.miraclaw/config.yaml\n\n", home)
	return nil
}

func RunPairingSetup(cfg *Config) error {
	var pairingID string
	err := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("Pairing Code").
				Description("Users must send this code to the bot to activate it.").
				Value(&pairingID),
		),
	).Run()
	if err != nil {
		return err
	}
	cfg.Telegram.PairingID = pairingID
	if err := Save(cfg); err != nil {
		return err
	}
	fmt.Printf("✓ Pairing code set. Send %q to the bot to activate.\n", pairingID)
	return nil
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
