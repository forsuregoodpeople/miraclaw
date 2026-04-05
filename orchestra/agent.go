package orchestra

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/miraclaw/config/prompts"
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
	PruneShortTerm(ctx context.Context, days int) error
	PromoteToLongTerm(ctx context.Context, msgID string) error
	ClearAll(ctx context.Context) error
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
	ShortTermTTLDays   int                // passed through from config; informational only (enforced in Memory)
	TextScanner        func(string) error // optional: security.ScanText
}

type Agent struct {
	memory         AgentMemory
	llm            LLM
	system         *System
	cfg            AgentConfig
	scanner        func(string) error
	pendingConfirm map[string]string // channelID → command awaiting user confirmation
	pendingMu      sync.Mutex
}

func NewAgent(memory AgentMemory, llm LLM, system *System, cfg AgentConfig) *Agent {
	return &Agent{
		memory:         memory,
		llm:            llm,
		system:         system,
		cfg:            cfg,
		scanner:        cfg.TextScanner,
		pendingConfirm: make(map[string]string),
	}
}

// handlePendingConfirm checks if there is a pending sudo confirmation for this
// channel. If so, it interprets the message text as a yes/no answer, runs or
// aborts the command, and returns (reply, true). Otherwise returns ("", false).
func (a *Agent) handlePendingConfirm(ctx context.Context, msg *Message) (string, bool) {
	a.pendingMu.Lock()
	cmd, ok := a.pendingConfirm[msg.ChannelID]
	if ok {
		delete(a.pendingConfirm, msg.ChannelID)
	}
	a.pendingMu.Unlock()

	if !ok {
		return "", false
	}

	switch strings.ToLower(strings.TrimSpace(msg.Text)) {
	case "yes", "y", "iya", "ok", "boleh":
		result, err := a.system.Exec(ctx, cmd)
		if err != nil {
			return fmt.Sprintf("Gagal menjalankan perintah: %v", err), true
		}
		return "```\n" + result + "\n```", true
	case "no", "tidak", "cancel", "batal":
		return "Perintah dibatalkan.", true
	default:
		return "Konfirmasi tidak valid. Perintah dibatalkan.", true
	}
}

func (a *Agent) Reply(ctx context.Context, msg *Message) (string, error) {
	if a.llm == nil {
		return "", fmt.Errorf("no LLM provider configured")
	}

	// 0. Check for pending sudo confirmation — bypasses full LLM pipeline.
	if reply, handled := a.handlePendingConfirm(ctx, msg); handled {
		_ = a.memory.Add(ctx, msg, "user")
		_ = a.memory.AddBotReply(ctx, msg.ChannelID, reply)
		return reply, nil
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

	// 2b. Auto-extract preferences from user message (backup if LLM doesn't call skill).
	// Use background context so the goroutine isn't cancelled when the request context ends.
	go a.autoExtractPreference(context.Background(), msg)

	// 3. Query Qdrant: session messages (short-term)
	maxTurns := a.cfg.MaxHistoryTurns
	if maxTurns <= 0 {
		maxTurns = 6
	}
	session, err := a.memory.GetSession(ctx, msg.ChannelID, uint64(maxTurns))
	if err != nil {
		return "", fmt.Errorf("get session: %w", err)
	}
	log.Printf("[DEBUG] Retrieved %d session messages for channel %s", len(session), msg.ChannelID)

	// 4. Query Qdrant: semantic search (short-term + long-term)
	maxCtx := a.cfg.MaxContextMessages
	if maxCtx <= 0 {
		maxCtx = 10
	}
	related, err := a.memory.Search(ctx, msg.ChannelID, msg.Text, uint64(maxCtx))
	if err != nil {
		return "", fmt.Errorf("memory search: %w", err)
	}

	// 4c. Fetch identity — guaranteed retrieval by category, no vector search
	identity, err := a.memory.GetStaticByCategory(ctx, IdentityCategory)
	if err != nil {
		return "", fmt.Errorf("identity fetch: %w", err)
	}

	// 4d. Fetch user preferences — guaranteed retrieval by category, no vector search
	userPrefs, err := a.memory.GetStaticByCategory(ctx, "user")
	if err != nil {
		return "", fmt.Errorf("user preferences fetch: %w", err)
	}

	// 5. Build role-based messages (token-efficient: only essential prompts)
	messages := a.buildMessagesEfficient(ctx, msg.Text, session, related, identity, userPrefs)
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
		} else if skillErr == nil && strings.HasPrefix(result, ConfirmPendingPrefix) {
			// confirm_sudo: store pending command and return confirmation prompt.
			cmd := strings.TrimPrefix(result, ConfirmPendingPrefix)
			a.pendingMu.Lock()
			a.pendingConfirm[msg.ChannelID] = cmd
			a.pendingMu.Unlock()
			resp = fmt.Sprintf("⚠️ Perintah ini membutuhkan akses elevated:\n`%s`\nIzinkan? (yes/no)", cmd)
		} else if rawOutputSkills[name] {
			// Raw skills: always show code block + LLM explanation separately.
			botName, lang := extractIdentityFields(identity)
			if botName == "" {
				botName = a.cfg.BotName
			}
			var skillSys strings.Builder
			skillSys.WriteString(prompts.SkillFormattingHeader)
			if botName != "" {
				fmt.Fprintf(&skillSys, prompts.IdentityNameTemplate, botName)
			}
			if lang != "" {
				fmt.Fprintf(&skillSys, prompts.LanguageRuleTemplate, lang)
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
			skillSys.WriteString(prompts.SkillResultFormatting)
			if botName != "" {
				fmt.Fprintf(&skillSys, prompts.IdentityNameTemplate, botName)
			}
			if lang != "" {
				fmt.Fprintf(&skillSys, prompts.LanguageRuleTemplate, lang)
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

// buildMessagesEfficient assembles the []ChatMessage to send to the LLM.
// Order: system prompt (persona+bubble+skills) → identity → user prefs → episodic background → session history → current user input.
// If ContextWindow > 0, lower-priority segments (episodic background, then oldest session turns) are trimmed to stay within budget.
// Parameters identity, userPrefs, and related are pre-fetched in Reply() to avoid duplicate Qdrant calls.
func (a *Agent) buildMessagesEfficient(_ context.Context, input string, session, related, identity, userPrefs []*Message) []ChatMessage {
	maxSnip := a.cfg.MaxMessageLen
	if maxSnip <= 0 {
		maxSnip = 400
	}
	maxInput := a.cfg.MaxInputLen
	if maxInput <= 0 {
		maxInput = 400
	}
	maxDesc := a.cfg.MaxSkillDescLen
	if maxDesc <= 0 {
		maxDesc = 40
	}

	// ── Segment 1: System prompt / persona (hardcoded, never trimmed) ─────────
	var sysContent strings.Builder

	now := time.Now()
	fmt.Fprintf(&sysContent, "Current date: %s, %d %s %d.\n", now.Weekday(), now.Day(), now.Month(), now.Year())
	sysContent.WriteString(prompts.CorePersona)
	sysContent.WriteByte('\n')
	sysContent.WriteString(prompts.BubbleFormat)
	sysContent.WriteByte('\n')
	sysContent.WriteString(prompts.ResponseConstraints)
	sysContent.WriteByte('\n')

	// Identity — storage format is "key: value" (e.g. "name: Sara", "language: Indonesian").
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
						fmt.Fprintf(&sysContent, prompts.IdentityNameTemplate, v)
					case "language":
						fmt.Fprintf(&sysContent, prompts.IdentityLanguageTemplate, v)
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
		fmt.Fprintf(&sysContent, prompts.IdentityNameTemplate, a.cfg.BotName)
	}
	if lang != "" {
		fmt.Fprintf(&sysContent, prompts.LanguageRuleTemplate, lang)
	}

	// User preferences
	if len(userPrefs) > 0 {
		sysContent.WriteString(prompts.UserPrefsHeader)
		for _, m := range userPrefs {
			for _, line := range strings.Split(strings.TrimSpace(m.Text), "\n") {
				line = strings.TrimSpace(line)
				if line != "" {
					sysContent.WriteString("- " + line + "\n")
				}
			}
		}
	}

	// Additional persona from config (optional)
	if a.cfg.SystemPrompt != "" {
		sysContent.WriteString(a.cfg.SystemPrompt)
		sysContent.WriteByte('\n')
	}

	// Skills list — always injected so LLM knows SKILL:name:input format
	if skills := a.system.SkillList(); len(skills) > 0 {
		sysContent.WriteString(prompts.SkillRulesHeader)
		for name, desc := range skills {
			fmt.Fprintf(&sysContent, " %s(%s)", name, trunc(desc, maxDesc))
		}
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleExec)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleConfirmSudo)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleMemory)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.MemorySkillExamples)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleGetIdentity)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleSetIdentity)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleCreateSchedule)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillRuleNeverRefuse)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.FewShotHeader)
		sysContent.WriteString(prompts.FewShotExamples)
		sysContent.WriteByte('\n')
		sysContent.WriteString(prompts.SkillSilentReminder)
	}

	var systemMsgs []ChatMessage
	if sysContent.Len() > 0 {
		systemMsgs = append(systemMsgs, ChatMessage{Role: "system", Content: strings.TrimSpace(sysContent.String())})
	}

	// ── Segment 2: Episodic background (pre-fetched related, deduped against session) ──
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

	// ── Segment 3: Session history (oldest trimmed if over budget) ────────────
	var sessionMsgs []ChatMessage
	for _, m := range session {
		if m.ID == "" {
			continue
		}
		role := m.Role
		if role == "" {
			role = "user"
		}
		sessionMsgs = append(sessionMsgs, ChatMessage{Role: role, Content: trunc(m.Text, maxInput)})
	}

	// ── Segment 4: Current user input (never trimmed) ─────────────────────────
	inputMsg := []ChatMessage{{Role: "user", Content: trunc(input, maxInput)}}

	// ── Context window enforcement ────────────────────────────────────────────
	if budget := a.cfg.ContextWindow; budget > 0 {
		fixed := estimateTokens(systemMsgs) + estimateTokens(inputMsg)
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

	// ── Final assembly ────────────────────────────────────────────────────────
	var msgs []ChatMessage
	msgs = append(msgs, systemMsgs...)
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
var backgroundSkills = prompts.BackgroundSkills

// rawOutputSkills are skills whose output should be shown verbatim as a code block,
// skipping the second LLM formatting call.
var rawOutputSkills = prompts.RawOutputSkills

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
// Input is taken only until the first newline (single-line skill call only).
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
	// Take input only until first newline (skill calls are single-line)
	input = rest[sep+1:]
	if nl := strings.IndexAny(input, "\n\r"); nl >= 0 {
		input = input[:nl]
	}
	return n, strings.TrimSpace(input), true
}

// ExtractPreference extracts preference patterns from msg and saves matches to memory.
// It is exported for synchronous use in tests; Reply() calls it via a goroutine.
func (a *Agent) ExtractPreference(ctx context.Context, msg *Message) {
	text := strings.ToLower(strings.TrimSpace(msg.Text))
	if text == "" {
		return
	}

	saveFact := func(label, rawText, matchedPattern string) {
		value := strings.TrimSpace(rawText[len(matchedPattern):])
		if value == "" {
			return
		}
		fact := fmt.Sprintf("%s %s", label, value)
		id := fmt.Sprintf("%s%d", prompts.AutoExtractIDPrefix, time.Now().UnixNano())
		if err := a.memory.AddStatic(ctx, id, fact, prompts.AutoExtractCategory); err == nil {
			log.Printf("[AutoExtract] Saved preference: %s", fact)
		}
	}

	for _, p := range prompts.AutoExtractPatterns {
		// Check prefix patterns first (higher specificity)
		for _, prefix := range p.Prefixes {
			if strings.HasPrefix(text, prefix) {
				saveFact(p.Label, msg.Text, msg.Text[:len(prefix)])
				return
			}
		}
		// Check contains patterns (mid-sentence)
		for _, sub := range p.Contains {
			if idx := strings.Index(text, sub); idx >= 0 {
				saveFact(p.Label, msg.Text[idx:], msg.Text[idx:idx+len(sub)])
				return
			}
		}
	}
}

// autoExtractPreference is the background goroutine wrapper for ExtractPreference.
func (a *Agent) autoExtractPreference(ctx context.Context, msg *Message) {
	a.ExtractPreference(ctx, msg)
}
