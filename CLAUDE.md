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

# Test
go test ./...

# Test single package
go test ./orchestra/...

# Lint (requires golangci-lint)
golangci-lint run
```

## Architecture

MiraClaw is an AI agent framework. The core loop is: receive input from a channel → run through the Agent (LLM + memory + skills) → respond back via the same channel.

**`orchestra/` package** — core abstractions:
- `Message` — canonical message struct with ID, Text, ChannelID; channel-agnostic
- `Memory` — long-term semantic memory backed by Qdrant vector DB; supports optional AES-256-GCM encryption at rest
- `Agent` — main orchestrator: manages short-term conversation history (in-memory per channel), long-term memory retrieval, prompt building, LLM calls, and skill dispatch
- `System` — skill registry + OS-level capabilities (Exec, ReadFile, WriteFile); injected into Agent
- `LLM` interface — abstraction over language model providers
- `Embedder` interface — abstraction over embedding providers

**`orchestra/channels/` package** — input channel adapters:
- `TelegramChannel` — receives Telegram updates, converts to `orchestra.Message`, calls `Agent.Reply()`

**`orchestra/providers/` package** — LLM backends: OpenAI, DeepSeek, Anthropic, Gemini

**`orchestra/embedders/` package** — embedding backends: OpenAI, Gemini

**`orchestra/security/` package** — rate limiting, injection scanning, SSRF guard, command guard, AES-256-GCM encryption

**`config/` package** — YAML config at `~/.miraclaw/config.yaml`; interactive setup via `--setup` flag

## Skill System

The LLM can invoke skills by responding with `SKILL:name:input`. Agent parses this and delegates to `System.Run()`. Skills are registered via `System.Register(name, desc, handler)`.
