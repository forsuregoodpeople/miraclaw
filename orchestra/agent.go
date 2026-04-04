package orchestra

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

type AgentMemory interface {
	Add(ctx context.Context, msg *Message, role string) error
	AddBotReply(ctx context.Context, channelID, text string) error
	GetSession(ctx context.Context, channelID string, limit uint64) ([]*Message, error)
	CloseSession(ctx context.Context, channelID string) error
	Search(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error)
	SearchStatic(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error)
	AddStatic(ctx context.Context, id, text, category string) error
	GetStaticByCategory(ctx context.Context, category string) ([]*Message, error)
}

type AgentConfig struct {
	BotName            string // injected as identity anchor in every system prompt
	SystemPrompt       string // additional persona/context appended after mandatory rules
	MaxContextMessages int
	MaxHistoryTurns    int
	MaxMessageLen      int // max chars per context snippet
	MaxOutputTokens    int
	MaxSummaryLen      int                // unused — kept for config compatibility
	MaxInputLen        int                // max chars for user input before truncation
	MaxSkillDescLen    int                // max chars per skill description
	ContextWindow      int                // max estimated input tokens for buildMessages; 0 = no limit
	TextScanner        func(string) error // optional: security.ScanText
}

type Agent struct {
	memory  AgentMemory
	llm     LLM
	system  *System
	cfg     AgentConfig
	scanner func(string) error
}

func NewAgent(memory AgentMemory, llm LLM, system *System, cfg AgentConfig) *Agent {
	return &Agent{
		memory:  memory,
		llm:     llm,
		system:  system,
		cfg:     cfg,
		scanner: cfg.TextScanner,
	}
}

func (a *Agent) Reply(ctx context.Context, msg *Message) (string, error) {
	if a.llm == nil {
		return "", fmt.Errorf("no LLM provider configured")
	}

	// 1. Store user message to Qdrant
	if err := a.memory.Add(ctx, msg, "user"); err != nil {
		return "", fmt.Errorf("memory add: %w", err)
	}

	// 2. Security scan
	if a.scanner != nil {
		if err := a.scanner(msg.Text); err != nil {
			return "Input rejected: security policy violation.", nil
		}
	}

	// 3. Query Qdrant: session messages (short-term)
	maxTurns := a.cfg.MaxHistoryTurns
	if maxTurns <= 0 {
		maxTurns = 6
	}
	session, err := a.memory.GetSession(ctx, msg.ChannelID, uint64(maxTurns))
	if err != nil {
		return "", fmt.Errorf("get session: %w", err)
	}

	// 4. Query Qdrant: semantic search (short-term + long-term)
	maxCtx := a.cfg.MaxContextMessages
	if maxCtx <= 0 {
		maxCtx = 2
	}
	related, err := a.memory.Search(ctx, msg.ChannelID, msg.Text, uint64(maxCtx))
	if err != nil {
		return "", fmt.Errorf("memory search: %w", err)
	}

	// 4b. Query static knowledge base — higher topN than episodic (prioritized)
	staticCtx := maxCtx * 2
	if staticCtx < 4 {
		staticCtx = 4
	}
	static, err := a.memory.SearchStatic(ctx, "", msg.Text, uint64(staticCtx))
	if err != nil {
		return "", fmt.Errorf("static knowledge fetch: %w", err)
	}

	// 4c. Fetch identity — guaranteed retrieval by category, no vector search
	identity, err := a.memory.GetStaticByCategory(ctx, IdentityCategory)
	if err != nil {
		return "", fmt.Errorf("identity fetch: %w", err)
	}

	// 5. Build role-based messages and call LLM
	messages := a.buildMessages(msg.Text, session, related, static, identity)
	maxOut := a.cfg.MaxOutputTokens
	if maxOut <= 0 {
		maxOut = 1024
	}
	resp, err := a.llm.Complete(ctx, Request{
		Messages:    messages,
		MaxTokens:   maxOut,
		Temperature: 0.7,
	})
	if err != nil {
		return "", err
	}

	// 6a. Run background skills (remember, set_identity) silently — strip from reply.
	resp = a.runBackgroundSkills(ctx, resp)

	// 6b. Dispatch result skill if LLM returned SKILL:name:input (non-background)
	if name, input, ok := parseSkillCall(resp); ok {
		result, skillErr := a.system.Run(ctx, name, input)
		if skillErr != nil {
			resp = fmt.Sprintf("skill %s error: %v", name, skillErr)
		} else if rawOutputSkills[name] {
			// Raw skills: always show code block + LLM explanation separately.
			botName, lang := extractIdentityFields(identity)
			if botName == "" {
				botName = a.cfg.BotName
			}
			var skillSys strings.Builder
			skillSys.WriteString("The user ran a shell command and got the output below. Write a SHORT human-friendly explanation (1-2 sentences) of what the output means. Do NOT repeat or re-show the output — just explain it naturally.\n")
			if botName != "" {
				fmt.Fprintf(&skillSys, "Your name is %s.\n", botName)
			}
			if lang != "" {
				fmt.Fprintf(&skillSys, "LANGUAGE RULE: You MUST always respond in %s.\n", lang)
			}
			userQuestion := messages[len(messages)-1].Content
			explanation, fmtErr := a.llm.Complete(ctx, Request{
				Messages: []ChatMessage{
					{Role: "system", Content: strings.TrimSpace(skillSys.String())},
					{Role: "user", Content: userQuestion},
					{Role: "assistant", Content: "SKILL:" + name + ":" + input},
					{Role: "user", Content: "Output:\n" + result},
				},
				MaxTokens:   256,
				Temperature: 0.7,
			})
			codeBlock := "```\n" + result + "\n```"
			if fmtErr == nil && strings.TrimSpace(explanation) != "" {
				resp = codeBlock + "\n\n" + strings.TrimSpace(explanation)
			} else {
				resp = codeBlock
			}
		} else {
			// Second LLM call: format skill result into a natural reply.
			// Inject identity (name + language) so persona is preserved.
			botName, lang := extractIdentityFields(identity)
			if botName == "" {
				botName = a.cfg.BotName
			}
			var skillSys strings.Builder
			skillSys.WriteString("Answer the user's question naturally using the data provided. Be concise.\n")
			if botName != "" {
				fmt.Fprintf(&skillSys, "Your name is %s.\n", botName)
			}
			if lang != "" {
				fmt.Fprintf(&skillSys, "LANGUAGE RULE: You MUST always respond in %s, regardless of what language the user writes in.\n", lang)
			}
			userQuestion := messages[len(messages)-1].Content
			formatted, fmtErr := a.llm.Complete(ctx, Request{
				Messages: []ChatMessage{
					{Role: "system", Content: strings.TrimSpace(skillSys.String())},
					{Role: "user", Content: userQuestion},
					{Role: "assistant", Content: "SKILL:" + name + ":" + input},
					{Role: "user", Content: "Result: " + result},
				},
				MaxTokens:   maxOut,
				Temperature: 0.7,
			})
			if fmtErr == nil {
				resp = formatted
			} else {
				resp = result
			}
		}
	}

	// 7. Store bot reply to Qdrant
	if err := a.memory.AddBotReply(ctx, msg.ChannelID, resp); err != nil {
		log.Printf("warn: memory add bot reply: %v", err)
	}

	return resp, nil
}

// buildMessages assembles the []ChatMessage to send to the LLM.
// Order: system prompt → identity → skills → static knowledge → episodik background → session history → current user input.
// If ContextWindow > 0, lower-priority segments (episodic background, then oldest session turns) are trimmed to stay within budget.
func (a *Agent) buildMessages(input string, session, related, static, identity []*Message) []ChatMessage {
	maxSnip := a.cfg.MaxMessageLen
	if maxSnip <= 0 {
		maxSnip = 120
	}
	maxInput := a.cfg.MaxInputLen
	if maxInput <= 0 {
		maxInput = 400
	}
	maxDesc := a.cfg.MaxSkillDescLen
	if maxDesc <= 0 {
		maxDesc = 40
	}

	// System prompt / persona
	var sysContent strings.Builder

	// Persona prompt — aspiration-based, unlocks full LLM potential
	now := time.Now()
	fmt.Fprintf(&sysContent, "Current date: %s, %d %s %d.\n", now.Weekday(), now.Day(), now.Month(), now.Year())
	sysContent.WriteString("You are a casual, warm friend — not an AI assistant. Talk naturally like a person texting.\n")
	sysContent.WriteString("- Answer directly. Just say what's needed, then stop.\n")
	sysContent.WriteString("- NEVER end with a question ('Ada yang mau dibahas?', 'Ada lagi?', etc.) unless the user explicitly asked something open-ended.\n")
	sysContent.WriteString("- Be personal: read the emotional tone, respond with empathy.\n")
	sysContent.WriteString("- Use humor or emojis when it fits, but keep it natural — don't force it.\n")
	sysContent.WriteString("BUBBLE FORMAT (mandatory): Each response MUST be split into 4-6 separate short messages minimum. Separate every idea, sentence, or thought with a blank line (\\n\\n). Never write more than 1-2 sentences per bubble. Think of each bubble as a separate chat message sent one by one. Expand your response naturally — add reactions, follow-up thoughts, emojis — to reach at least 4 bubbles.\n")
	sysContent.WriteString("Example — CORRECT (4 bubbles):\nHalo! 😊\n\nWah, siang-siang udah muncul nih.\n\nGimana harimu sejauh ini?\n\nSemoga lancar ya!\n\nExample — WRONG (1 bubble):\nHalo! 😊 Wah siang-siang udah muncul. Gimana harimu? Semoga lancar!\n")
	sysContent.WriteString("- NEVER echo the user's message. NEVER reply with just 'ok', 'hmm', or a single word.\n")

	// Identity — fetched from Qdrant static category="identity", guaranteed retrieval.
	// Storage format is "key: value" (e.g. "name: Sara", "language: Indonesian").
	// Translate to prose for the LLM system prompt.
	var lang string
	if len(identity) > 0 {
		for _, m := range identity {
			for _, line := range strings.Split(strings.TrimSpace(m.Text), "\n") {
				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}
				if k, v, ok := strings.Cut(line, ":"); ok {
					k = strings.TrimSpace(strings.ToLower(k))
					v = strings.TrimSpace(v)
					switch k {
					case "name":
						fmt.Fprintf(&sysContent, "- Your name is %s.\n", v)
					case "language":
						fmt.Fprintf(&sysContent, "- Always respond in %s.\n", v)
						lang = v
					default:
						sysContent.WriteString("- " + line + "\n")
					}
				} else {
					sysContent.WriteString("- " + line + "\n")
				}
			}
		}
	} else if a.cfg.BotName != "" {
		fmt.Fprintf(&sysContent, "- Your name is %s.\n", a.cfg.BotName)
	}
	// Language directive — explicit top-level rule so LLM cannot ignore it
	if lang != "" {
		fmt.Fprintf(&sysContent, "LANGUAGE RULE: You MUST always respond in %s, regardless of what language the user writes in.\n", lang)
	}

	// Additional persona from config (optional)
	if a.cfg.SystemPrompt != "" {
		sysContent.WriteString(a.cfg.SystemPrompt)
		sysContent.WriteByte('\n')
	}

	// Skills list — always injected
	if skills := a.system.SkillList(); len(skills) > 0 {
		sysContent.WriteString("You have skills. Available skills:")
		for name, desc := range skills {
			fmt.Fprintf(&sysContent, " %s(%s)", name, trunc(desc, maxDesc))
		}
		sysContent.WriteString("\nSKILL RULES: (1) For exec: output ONLY SKILL:exec:<command> — no preamble. exec runs via sh -c so builtins (cd), pipes (|), chaining (&&) all work. Use it for EVERYTHING system-related: ls, df -h, date, free -h, cat /etc/hostname, ps aux, systemctl status, uname -a, etc. Multi-step: combine with && e.g. SKILL:exec:cd /home && ls -la. Never split into multiple SKILL:exec calls. (2) For memory skills (remember, set_identity): add on its own line anywhere in reply — runs silently. (3) User shares personal info/preference → add SKILL:remember:<fact> line. (4) User asks about your identity → SKILL:get_identity:. (5) User wants to change name/language → SKILL:set_identity:<field>:<value> line. (6) Never refuse a matching skill. (7) For create_schedule: SKILL:create_schedule:<5-field-cron>|||<reminder text> — the ||| separator is REQUIRED.\n")
	}

	// ── Segment 1: System prompt / persona (never trimmed) ───────────────────
	var systemMsgs []ChatMessage
	if sysContent.Len() > 0 {
		systemMsgs = append(systemMsgs, ChatMessage{Role: "system", Content: strings.TrimSpace(sysContent.String())})
	}

	// ── Segment 2: Static knowledge (never trimmed) ───────────────────────────
	var staticMsgs []ChatMessage
	for _, m := range static {
		if text := strings.TrimSpace(m.Text); text != "" {
			staticMsgs = append(staticMsgs, ChatMessage{
				Role:    "system",
				Content: "Static: " + trunc(text, maxSnip),
			})
		}
	}

	// ── Segment 3: Episodic background (trimmed first if over budget) ─────────
	sessionIDs := make(map[string]struct{}, len(session))
	for _, m := range session {
		sessionIDs[m.ID] = struct{}{}
	}
	var bgParts []string
	for _, m := range related {
		if _, inSession := sessionIDs[m.ID]; !inSession {
			bgParts = append(bgParts, trunc(m.Text, maxSnip))
		}
	}
	var bgMsgs []ChatMessage
	if len(bgParts) > 0 {
		bgMsgs = append(bgMsgs, ChatMessage{
			Role:    "system",
			Content: "Background: " + strings.Join(bgParts, " | "),
		})
	}

	// ── Segment 4: Session history (oldest trimmed second) ────────────────────
	var sessionMsgs []ChatMessage
	for _, m := range session {
		if m.ID == "" {
			continue
		}
		role := m.Role
		if role == "" {
			role = "user" // backward-compat: old records without role field
		}
		sessionMsgs = append(sessionMsgs, ChatMessage{Role: role, Content: trunc(m.Text, maxInput)})
	}

	// ── Segment 5: Current user input (never trimmed) ─────────────────────────
	inputMsg := []ChatMessage{{Role: "user", Content: trunc(input, maxInput)}}

	// ── Context window enforcement ────────────────────────────────────────────
	// estimateTokens uses len/4 as a fast approximation (1 token ≈ 4 chars).
	if budget := a.cfg.ContextWindow; budget > 0 {
		fixed := estimateTokens(systemMsgs) + estimateTokens(staticMsgs) + estimateTokens(inputMsg)
		remaining := budget - fixed
		// Drop episodic background as a unit if it doesn't fit
		if estimateTokens(bgMsgs) > remaining {
			bgMsgs = nil
		}
		remaining -= estimateTokens(bgMsgs)
		// Trim oldest session turns until history fits
		for len(sessionMsgs) > 0 && estimateTokens(sessionMsgs) > remaining {
			sessionMsgs = sessionMsgs[1:]
		}
	}

	// ── Flatten segments ──────────────────────────────────────────────────────
	var msgs []ChatMessage
	msgs = append(msgs, systemMsgs...)
	msgs = append(msgs, staticMsgs...)
	msgs = append(msgs, bgMsgs...)
	msgs = append(msgs, sessionMsgs...)
	msgs = append(msgs, inputMsg...)
	return msgs
}

func (a *Agent) System() *System {
	return a.system
}

// estimateTokens approximates the token count of a message slice (1 token ≈ 4 chars).
func estimateTokens(msgs []ChatMessage) int {
	total := 0
	for _, m := range msgs {
		total += len(m.Content) / 4
	}
	return total
}

func trunc(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// backgroundSkills are skill names that run silently as side-effects and do not
// replace the reply — they are stripped from the LLM output after execution.
var backgroundSkills = map[string]bool{
	"remember":     true,
	"set_identity": true,
}

// rawOutputSkills are skills whose output should be shown verbatim as a code block,
// skipping the second LLM formatting call.
var rawOutputSkills = map[string]bool{
	"exec":         true,
	"query_memory": true,
}

// runBackgroundSkills scans resp for SKILL:name:input lines belonging to
// backgroundSkills, executes them silently, and returns resp with those lines removed.
func (a *Agent) runBackgroundSkills(ctx context.Context, resp string) string {
	var kept []string
	for _, line := range strings.Split(resp, "\n") {
		trimmed := strings.TrimSpace(line)
		name, input, ok := parseSkillCall(trimmed)
		if ok && backgroundSkills[name] {
			if _, err := a.system.Run(ctx, name, input); err != nil {
				log.Printf("warn: background skill %s: %v", name, err)
			}
			// drop this line from reply
			continue
		}
		kept = append(kept, line)
	}
	return strings.TrimSpace(strings.Join(kept, "\n"))
}

// extractIdentityFields parses name and language from identity messages stored
// in "key: value" format (e.g. "name: Sara", "language: Indonesian").
func extractIdentityFields(identity []*Message) (name, lang string) {
	for _, m := range identity {
		for _, line := range strings.Split(strings.TrimSpace(m.Text), "\n") {
			k, v, ok := strings.Cut(line, ":")
			if !ok {
				continue
			}
			switch strings.TrimSpace(strings.ToLower(k)) {
			case "name":
				name = strings.TrimSpace(v)
			case "language":
				lang = strings.TrimSpace(v)
			}
		}
	}
	return
}

// parseSkillCall parses "SKILL:name:input" from anywhere in LLM response.
// This handles cases where the LLM adds preamble text before the skill call.
func parseSkillCall(resp string) (name, input string, ok bool) {
	idx := strings.Index(resp, "SKILL:")
	if idx < 0 {
		return "", "", false
	}
	rest := resp[idx+len("SKILL:"):]
	sep := strings.Index(rest, ":")
	if sep < 0 {
		return rest, "", true
	}
	n := rest[:sep]
	// Guard against false positives: skill name must not contain whitespace
	if strings.ContainsAny(n, " \n\r\t") {
		return "", "", false
	}
	return n, rest[sep+1:], true
}
