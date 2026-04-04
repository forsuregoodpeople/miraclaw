```
██   ██  ███████  ██████     ███     ██████  ██         ███    ██   ██
███ ███    ███    ██   ██   ██ ██   ██       ██        ██ ██   ██   ██
████████   ███    ██   ██  ██   ██  ██       ██       ██   ██  ██ █ ██
██ █ ██    ███    ██████   ███████  ██       ██       ███████  ████████
██   ██    ███    ██  ██   ██   ██  ██       ██       ██   ██  ██ █ ██
██   ██    ███    ██   ██  ██   ██  ██       ██       ██   ██  ██   ██
██   ██  ███████  ██   ██  ██   ██   ██████  ███████  ██   ██  ██   ██
```

**The most token-efficient self-hosted AI agent — OpenClaw-compatible, built for people who care about every token.**

> ⚠️ **Alpha Version** — MiraClaw is currently in alpha. APIs, configuration formats, and behavior may change without notice. Not recommended for production use yet.

---

## What is MiraClaw?

MiraClaw is an alternative to OpenClaw, built with one core ambition: **do everything OpenClaw does, but spend as few tokens as possible doing it.** It is a self-hosted AI agent framework you run on your own server — not a Telegram bot (Telegram is simply one supported input channel).

Every architectural decision is driven by token efficiency: short, targeted memory retrieval instead of dumping full history; skill descriptions capped at 40 characters in the prompt; context window budgeting that prunes low-priority segments before high-priority ones; aspiration-based system prompts that are shorter than rule-based equivalents. The goal is a capable, long-memory agent that costs a fraction of what a naive implementation would.

At its core, MiraClaw is an agent loop: receive input → retrieve only the relevant memories → call an LLM → execute skills → store the reply. Everything persists across restarts via a 4-tier Qdrant vector database, so your agent remembers conversations, facts, identity, and scheduled tasks indefinitely — without re-sending the entire history every time.

---

## Features

- **Token-efficient by design** — targeted memory retrieval, capped skill descriptions, context window budgeting; never sends more than needed
- **4-tier semantic memory** — Session, ShortTerm, LongTerm, and Static collections backed by Qdrant
- **Multi-provider LLM** — OpenAI, Anthropic (Claude), DeepSeek, Google Gemini
- **Hot-swap model** — switch LLM model at runtime with `/model`, no restart required
- **Skill system** — LLM invokes skills via `SKILL:name:input`; extensible at the Go level
- **Cron scheduler** — recurring reminders with natural time input (`"9 AM daily"` → cron)
- **Plan skills** — task/to-do management stored in memory
- **Persistent identity** — bot name, language, and persona survive restarts; updatable via chat
- **AES-256-GCM encryption** — optional passphrase-based encryption of all stored memories
- **Security hardening** — injection scanner, SSRF guard, command guard, rate limiter
- **Telegram pairing gate** — single-user mode via one-time code; blocks all other callers
- **One-liner install** — single `curl | bash` installs Qdrant + MiraClaw as systemd services, no clone needed
- **Background mode** — `--detach` flag re-launches as a detached background process
- **Custom knowledge** — load a Markdown file (`AGENT.md`) as persistent static knowledge

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                          MiraClaw                             │
│                                                               │
│   Input Channel            Core                  Storage      │
│  ┌─────────────┐   ┌─────────────────┐   ┌────────────────┐  │
│  │  Telegram   │──▶│     Agent       │──▶│    Qdrant      │  │
│  │  Channel    │   │                 │   │  ┌──────────┐  │  │
│  └─────────────┘   │  LLM + Memory   │   │  │ Session  │  │  │
│                    │  + Skill System │   │  │ShortTerm │  │  │
│  ┌─────────────┐   └────────┬────────┘   │  │ LongTerm │  │  │
│  │  Scheduler  │────────────┘            │  │  Static  │  │  │
│  └─────────────┘                         │  └──────────┘  │  │
│                    ┌────────────────┐    └────────────────┘  │
│                    │  LLM Backend   │                         │
│                    │ OpenAI/Claude/ │                         │
│                    │ DeepSeek/Gemini│                         │
│                    └────────────────┘                         │
└───────────────────────────────────────────────────────────────┘
```

**Core loop:**
```
Input → Security scan → Retrieve memory (session + semantic + static)
      → Build prompt → LLM call → Parse skill → Execute skill
      → Second LLM call (format result) → Store reply → Respond
```

---

## Requirements

| Dependency | Version | Notes |
|---|---|---|
| Go | ≥ 1.26 | Required to build |
| curl | any | Used by installer |
| systemctl | any | Linux with systemd |
| Qdrant | v1.14.0 | Installed automatically |

Architecture: `x86_64` or `aarch64` (Linux only).

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/forsuregoodpeople/miraclaw/main/install.sh | sudo bash
```

No clone needed. The installer will:
1. Check Go ≥ 1.26 and required tools
2. Clone the MiraClaw source to `/usr/local/src/miraclaw`
3. Download and install **Qdrant** as a systemd service
4. Build the **MiraClaw** binary to `/usr/local/bin/miraclaw`
5. Install **MiraClaw** as a systemd service (auto-start on boot, restart on failure)
6. Add `miraclaw` alias to `~/.bashrc`
7. Launch the interactive **setup wizard** to configure your tokens and LLM
8. Start both services

After install:

```bash
journalctl -u miraclaw -f        # live logs
systemctl stop miraclaw           # stop
systemctl start miraclaw          # start
miraclaw --setup                  # reconfigure
```

### From a local clone

```bash
git clone https://github.com/forsuregoodpeople/miraclaw.git
cd MiraClaw
sudo bash install.sh
```

### Manual run (without systemd)

```bash
miraclaw             # foreground
miraclaw --detach    # background (detached process)
```

---

## Configuration

### Interactive Setup Wizard

```bash
miraclaw --setup
```

The wizard configures:
- Telegram bot token
- LLM provider and API key
- Model selection
- Embedder provider (optional, defaults to LLM provider)
- Encryption passphrase (optional)
- Bot name
- Custom knowledge file path
- System prompt / persona

Config is saved to `~/.miraclaw/config.yaml` (mode `0600`).

### Pairing Gate Setup

```bash
miraclaw --pairing
```

Sets a one-time pairing code. Only the first Telegram user who sends the correct code to the bot will be paired; all others are silently blocked.

### config.yaml Reference

```yaml
telegram:
  token: "123:ABC"            # Telegram bot token (required)
  pairing_id: "1234567"       # One-time pairing code (optional)
  paired_chat_id: 0           # Set automatically after pairing

qdrant:
  host: "localhost"
  port: 6334                  # gRPC port
  collection_session: "miraclaw_session"
  collection_short_term: "miraclaw_short_term"
  collection_long_term: "miraclaw_long_term"
  collection_static: "miraclaw_static"

agent:
  bot_name: "Mira"            # Bot display name
  agent_md: "~/.miraclaw/AGENT.md"  # Optional knowledge file
  max_context_messages: 2     # Semantic search result count
  max_history_turns: 6        # Session history depth
  max_message_len: 120        # Chars per context snippet
  max_output_tokens: 1024     # Max LLM response tokens
  max_input_len: 400          # User input truncation threshold
  max_skill_desc_len: 40      # Chars per skill in prompt
  context_window: 4096        # Max estimated input tokens (0 = unlimited)

llm:
  provider: "openai"          # openai | anthropic | deepseek | gemini
  api_key: "sk-..."
  model: "gpt-4o-mini"

embedder:
  provider: "openai"          # openai | gemini (defaults to llm.provider)
  api_key: ""                 # Defaults to llm.api_key if empty

security:
  encryption_key: ""          # AES-256-GCM passphrase (optional)

schedule:
  rules: []                   # Managed via create_schedule skill
```

---

## Usage

### CLI Flags

| Flag | Description |
|---|---|
| *(none)* | Start the bot (runs setup wizard if not configured) |
| `--setup` | Launch interactive configuration wizard |
| `--pairing` | Configure Telegram pairing gate |
| `--detach` | Re-launch as detached background process |

### Slash Commands

Send these in the Telegram chat:

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/new` or `/clear` | Reset current session (clears conversation context) |
| `/status` | Show active LLM provider and model |
| `/model` | List models available from current provider |
| `/model <name>` | Switch to a different model live (no restart) |
| `/remember <text>` | Save a fact to persistent memory |
| `/identity <field>:<value>` | Update bot identity (e.g. `/identity language:Indonesian`) |
| `/forget` | Clear all memory collections |

### Skill System

The LLM invokes skills using the format `SKILL:name:input`. Skills can appear anywhere in the response; the agent parses and executes them automatically.

**Available skills:**

| Skill | Input | Description |
|---|---|---|
| `exec` | shell command | Run a shell command via `sh -c` (pipes, `&&`, builtins supported) |
| `remember` | text | Save text to static memory silently |
| `get_identity` | *(empty)* | Retrieve current bot identity fields |
| `set_identity` | `field:value` | Update a bot identity field (e.g. `name:Sara`) |
| `clear_memory` | *(empty)* | Wipe all memory collections |
| `promote` | message ID | Promote a message from ShortTerm to LongTerm memory |
| `create_schedule` | `CRON\|\|\|prompt` | Add a recurring reminder |
| `list_schedules` | *(empty)* | List all active scheduled reminders |
| `delete_schedule` | index | Remove a schedule by its index |
| `plan_add` | `title\|\|\|tasks` | Create a task plan (newline-separated tasks) |
| `plan_get` | title filter *(optional)* | Retrieve plans |
| `plan_delete` | title | Delete a plan |

**Example — schedule a daily reminder:**
```
SKILL:create_schedule:0 9 * * *|||Good morning! Here's your daily summary.
```
Cron format: `MINUTE HOUR * * WEEKDAY` (5 fields, space-separated).
The agent also understands natural time input like `"9 AM"` or `"3:30 PM"`.

---

## Memory Tiers

MiraClaw stores all memories in Qdrant. Every collection is searchable by semantic similarity via embeddings (OpenAI `text-embedding-3-small` or Gemini).

| Tier | Collection | Purpose | Retrieval |
|---|---|---|---|
| **Session** | `miraclaw_session` | Current conversation turns | Ordered by time, filtered by `channel_id` |
| **ShortTerm** | `miraclaw_short_term` | Recent episodic memory | Semantic similarity search |
| **LongTerm** | `miraclaw_long_term` | Promoted important facts | Semantic similarity search |
| **Static** | `miraclaw_static` | Permanent knowledge + identity | Semantic search + exact category match |

**Identity** is stored in Static with `category=identity` and fetched on every reply via exact category match — it is always available regardless of input. Update it via `/identity` or by chatting (`"From now on, speak in Spanish"`).

**Memory encryption** — if `security.encryption_key` is set, all text is encrypted with AES-256-GCM (Scrypt key derivation) before being stored in Qdrant.

---

## LLM Providers

| Provider | `llm.provider` | Notes |
|---|---|---|
| OpenAI | `openai` | Supports `ListModels` for `/model` command |
| Anthropic | `anthropic` | Claude family |
| DeepSeek | `deepseek` | |
| Google Gemini | `gemini` | Also supports Gemini embedder |

The active provider is hot-swappable at runtime via `/model <name>` — the new model is loaded and swapped in atomically without restarting the process.

---

## Security

MiraClaw includes several hardening layers:

| Layer | What it does |
|---|---|
| **Rate limiter** | 50 requests/minute per Telegram channel (token bucket) |
| **Injection scanner** | Detects SQL injection and prompt injection patterns in user input |
| **SSRF guard** | Validates URLs; rejects private IPs, RFC 1918 ranges, cloud metadata endpoints |
| **Command guard** | Blocks dangerous shell patterns (rm -rf, sudo, curl\|bash, path traversal, etc.) |
| **Memory encryption** | AES-256-GCM with Scrypt key derivation; encrypts all Qdrant payloads |
| **Pairing gate** | One-time code; only the paired chat ID can reach the agent |

---

## Scheduler

MiraClaw includes a cron-based scheduler. Rules are persisted in `config.yaml` and survive restarts.

**Add a schedule via chat:**
> "Remind me every weekday at 9 AM to review my tasks."

The agent will invoke `SKILL:create_schedule:0 9 * * 1-5|||Review your tasks for today!`.

**Manage via slash commands:** *(not direct, managed via the skill system)*

**Cron format:**
```
┌─────── minute  (0-59)
│ ┌───── hour    (0-23)
│ │ ┌─── day     (* = every day)
│ │ │ ┌─ month   (* = every month)
│ │ │ │ ┌ weekday (0=Sun, 1=Mon … 5=Fri, 6=Sat)
│ │ │ │ │
0 9 * * 1-5   →  every weekday at 09:00
```

---

## Custom Knowledge

You can provide a Markdown file as a persistent knowledge base for your agent:

1. Create `~/.miraclaw/AGENT.md`
2. Set `agent.agent_md: ~/.miraclaw/AGENT.md` in config (done automatically by `--setup`)
3. Structure the file with `## Heading` sections — each section is indexed separately

```markdown
## Home Automation
The lights switch is at 192.168.1.100. Use the API at /api/switch?id=1.

## Work Schedule
Standup is every weekday at 10 AM in room B-204.
```

Sections are seeded into Static memory on every startup (idempotent via content hash).

---

## Docker (Qdrant only)

A `docker-compose.yaml` is included to run Qdrant in Docker while MiraClaw runs on the host:

```bash
docker compose up -d qdrant
miraclaw
```

MiraClaw itself is designed to run as a native binary or systemd service, not in a container.

---

## Development

```bash
# Build
go build ./...

# Run tests
go test ./...

# Run single package
go test ./orchestra/...

# Lint
golangci-lint run

# Run with setup
go run main.go --setup
```

---

## License

MIT
