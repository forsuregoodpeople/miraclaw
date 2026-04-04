package orchestra

import (
	"context"
	"fmt"
	"strings"
)

// AgentMemory is the interface Agent uses for memory operations.
// This allows unit tests to inject a fake without a real Qdrant instance.
type AgentMemory interface {
	Add(ctx context.Context, msg *Message, role string) error
	AddBotReply(ctx context.Context, channelID, text string) error
	GetSession(ctx context.Context, channelID string, limit uint64) ([]*Message, error)
	Search(ctx context.Context, query string, topN uint64) ([]*Message, error)
	CloseSession(ctx context.Context, channelID string) error
}

type AgentConfig struct {
	SystemPrompt       string
	MaxContextMessages int
	MaxHistoryTurns    int // max session messages to include in prompt
	MaxMessageLen      int // max chars per context snippet
	MaxOutputTokens    int
	MaxSummaryLen      int // unused — kept for config compatibility
	MaxInputLen        int // max chars for user input before truncation
	MaxSkillDescLen    int // max chars per skill description
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

	// 4. Query Qdrant: semantic search (long-term)
	maxCtx := a.cfg.MaxContextMessages
	if maxCtx <= 0 {
		maxCtx = 2
	}
	related, err := a.memory.Search(ctx, msg.Text, uint64(maxCtx))
	if err != nil {
		return "", fmt.Errorf("memory search: %w", err)
	}

	// 5. Build role-based messages and call LLM
	messages := a.buildMessages(msg.Text, session, related)
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

	// 6. Dispatch skill if LLM returned SKILL:name:input
	if name, input, ok := parseSkillCall(resp); ok {
		result, skillErr := a.system.Run(ctx, name, input)
		if skillErr != nil {
			resp = fmt.Sprintf("skill %s error: %v", name, skillErr)
		} else {
			resp = result
		}
	}

	// 7. Store bot reply to Qdrant
	if err := a.memory.AddBotReply(ctx, msg.ChannelID, resp); err != nil {
		// non-fatal: log but don't fail the reply
		_ = err
	}

	return resp, nil
}

// buildMessages assembles the []ChatMessage to send to the LLM.
// Order: system prompt → skills → long-term background → session history → current user input.
func (a *Agent) buildMessages(input string, session, related []*Message) []ChatMessage {
	var msgs []ChatMessage

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
	if a.cfg.SystemPrompt != "" {
		sysContent.WriteString(a.cfg.SystemPrompt)
		sysContent.WriteByte('\n')
	}

	// Skills list
	if skills := a.system.SkillList(); len(skills) > 0 {
		sysContent.WriteString("Skills (reply SKILL:name:input to call):")
		for name, desc := range skills {
			fmt.Fprintf(&sysContent, " %s(%s)", name, trunc(desc, maxDesc))
		}
		sysContent.WriteByte('\n')
	}

	// OS info
	info := a.system.OSInfo()
	fmt.Fprintf(&sysContent, "OS:%s/%s", info.OS, info.Arch)

	if sysContent.Len() > 0 {
		msgs = append(msgs, ChatMessage{Role: "system", Content: strings.TrimSpace(sysContent.String())})
	}

	// Long-term background context (deduplicate against session)
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
	if len(bgParts) > 0 {
		msgs = append(msgs, ChatMessage{
			Role:    "system",
			Content: "Background: " + strings.Join(bgParts, " | "),
		})
	}

	// Session history as user/assistant turns
	// session is ordered oldest→newest; exclude the last entry if it's the current user msg
	for _, m := range session {
		if m.ID == "" {
			continue
		}
		// We don't have role stored in Message yet — use a heuristic:
		// messages stored as "user" have no "bot-" prefix on ID; assistant replies have "bot-" prefix.
		role := "user"
		if strings.HasPrefix(m.ID, "bot-") {
			role = "assistant"
		}
		msgs = append(msgs, ChatMessage{Role: role, Content: trunc(m.Text, maxInput)})
	}

	// Current user input
	msgs = append(msgs, ChatMessage{Role: "user", Content: trunc(input, maxInput)})

	return msgs
}

func (a *Agent) System() *System {
	return a.system
}

func trunc(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// parseSkillCall parses "SKILL:name:input" from LLM response.
func parseSkillCall(resp string) (name, input string, ok bool) {
	if !strings.HasPrefix(resp, "SKILL:") {
		return "", "", false
	}
	rest := resp[len("SKILL:"):]
	idx := strings.Index(rest, ":")
	if idx < 0 {
		return rest, "", true
	}
	return rest[:idx], rest[idx+1:], true
}
