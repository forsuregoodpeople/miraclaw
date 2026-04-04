# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is MiraClaw

MiraClaw is an alternative to OpenClaw — a self-hosted AI agent framework with long-term semantic memory, multi-provider LLM support, and a skill system. It is NOT a Telegram bot; Telegram is simply one supported input channel. The module path is `github.com/miraclaw`.

## Commands

```bash
# Build
go build ./...

# Run
go run main.go

# Run with setup wizard
go run main.go --setup

# Run pairing setup
go run main.go --pairing

# Test all
go test ./...

# Test single package
go test ./orchestra/...

# Test single file/function
go test ./orchestra/... -run TestFunctionName

# Lint (requires golangci-lint)
golangci-lint run
```

## Architecture

MiraClaw is an AI agent framework. The core loop is: receive input from a channel → run through the Agent (LLM + memory + skills) → respond back via the same channel.

**`orchestra/` package** — core abstractions:
- `Message` — canonical message struct with ID, Text, ChannelID; channel-agnostic
- `Memory` — 4-tier Qdrant-backed memory: Session (per-conversation), ShortTerm, LongTerm, Static (permanent knowledge). Auto-starts Qdrant via `systemctl` if not running. Optional AES-256-GCM encryption via `SetEncryptor`.
- `Agent` — orchestrates: stores user msg → security scan → retrieves session + semantic + static memory → builds prompt → calls LLM → dispatches skills → stores reply. Entry point: `Agent.Reply(ctx, msg)`.
- `System` — skill registry + OS capabilities (Exec, ReadFile, WriteFile). Validates commands/URLs via injected validators.
- `SwappableLLM` — hot-swappable LLM wrapper; used for `/model` switching without restart.
- `knowledge.go` — seeds built-in knowledge and bot identity into Qdrant static on startup (idempotent via FNV-32a hash IDs). `SeedIdentity` only seeds if no identity exists yet (preserves user updates). `LoadKnowledgeFile` loads optional `~/.miraclaw/AGENT.md`.

**`orchestra/channels/` package**:
- `TelegramChannel` — receives updates, enforces pairing gate, routes slash commands, calls `Agent.Reply()`, splits LLM reply into multi-bubble messages (split on `\n\n`, each sent as a separate Telegram message with typing delay).
- `CommandHandler` — slash command handling (`/start`, `/new`, `/clear`, `/model`, `/status`, `/help`). Holds `BotConfig{Provider, Model, BotName}`.
- `PairingHandler` — enforces a one-time pairing code gate; only the paired chat ID can reach the agent.

**`orchestra/providers/` package** — LLM backends: OpenAI, DeepSeek, Anthropic, Gemini

**`orchestra/embedders/` package** — embedding backends: OpenAI, Gemini

**`orchestra/security/` package** — rate limiting, injection scanning, SSRF guard, command guard, AES-256-GCM encryption

**`config/` package** — YAML config at `~/.miraclaw/config.yaml`; interactive setup via `--setup` flag. Key agent fields: `BotName`, `AgentMD` (path to knowledge file), `MaxHistoryTurns`, `MaxContextMessages`, `MaxOutputTokens`.

## Memory Tiers

| Collection | Purpose | Retrieval |
|---|---|---|
| Session | Recent conversation turns | `GetSession` — ordered, by `channel_id` |
| ShortTerm | Recent episodic memory | `Search` — vector similarity |
| LongTerm | Promoted important memories | `Search` — vector similarity |
| Static | Permanent knowledge + identity | `SearchStatic` (semantic) + `GetStaticByCategory` (exact match) |

Identity is stored in Static with `category="identity"` and fetched every reply via `GetStaticByCategory` (not semantic search) — so identity is always available regardless of input.

## Skill System

The LLM invokes skills by responding with `SKILL:name:input`. `parseSkillCall` scans anywhere in the response (handles LLM preamble). Agent dispatches to `System.Run()`, then makes a second LLM call to format the result naturally.

Built-in skills (`skills.RegisterAll`): `datetime`, `exec`, `readfile`, `writefile`, `sysinfo`

Memory skills (`skills.RegisterMemorySkills`): `remember`, `get_identity`, `set_identity`, `clear_memory`, `promote`

`set_identity` merges field updates into the existing identity record using stable ID `"identity-bot"` — chat-driven identity changes survive restarts.

## Prompt Architecture

`buildMessages()` in `agent.go` assembles the LLM context in this order:
1. Persona prompt (aspiration-based — "Be X", not "NEVER X") + identity from Qdrant + skills list
2. Static knowledge — each item as a separate `system` message (higher priority)
3. Episodic background (semantic search results, deduplicated against session)
4. Session history as `user`/`assistant` turns
5. Current user input

Static gets `topN = maxCtx * 2` (min 4) to prioritize knowledge base over episodic memory.
