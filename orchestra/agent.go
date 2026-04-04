package orchestra

import (
	"context"
	"fmt"
	"log"
	"strings"
)

type AgentMemory interface {
	Add(ctx context.Context, msg *Message, role string) error
	AddBotReply(ctx context.Context, channelID, text string) error
	GetSession(ctx context.Context, channelID string, limit uint64) ([]*Message, error)
	CloseSession(ctx context.Context, channelID string) error
	Search(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error)
	SearchStatic(ctx context.Context, channelID, query string, topN uint64) ([]*Message, error)
	AddStatic(ctx context.Context, id, text, category string) error
}

type AgentConfig struct {
	SystemPrompt       string
	MaxContextMessages int
	MaxHistoryTurns    int
	MaxMessageLen      int // max chars per context snippet
	MaxOutputTokens    int
	MaxSummaryLen      int                // unused — kept for config compatibility
	MaxInputLen        int                // max chars for user input before truncation
	MaxSkillDescLen    int                // max chars per skill description
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

	// 4b. Query static knowledge base
	static, err := a.memory.SearchStatic(ctx, msg.ChannelID, msg.Text, uint64(maxCtx))
	if err != nil {
		log.Printf("warn: static search: %v", err)
		static = nil
	}

	// 5. Build role-based messages and call LLM
	messages := a.buildMessages(msg.Text, session, related, static)
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
			// Second LLM call: format skill result into a natural reply
			userQuestion := messages[len(messages)-1].Content
			formatted, fmtErr := a.llm.Complete(ctx, Request{
				Messages: []ChatMessage{
					{Role: "system", Content: "Answer the user's question naturally using the data provided. Be concise."},
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
// Order: system prompt → skills → static knowledge → episodik background → session history → current user input.
func (a *Agent) buildMessages(input string, session, related, static []*Message) []ChatMessage {
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

	// Skills list — always injected by the agent, not dependent on user's system prompt
	if skills := a.system.SkillList(); len(skills) > 0 {
		sysContent.WriteString("You have skills to fulfill user requests. Reply EXACTLY with SKILL:<skill>:<input> and nothing else when using a skill. Available skills:")
		for name, desc := range skills {
			fmt.Fprintf(&sysContent, " %s(%s)", name, trunc(desc, maxDesc))
		}
		sysContent.WriteString("\nRULES: (1) When user asks to remember/save/store anything → call SKILL:remember:<text>. (2) When user shares their name/preference → call SKILL:remember:<fact>. (3) Never refuse a skill — if a skill matches, always call it.\n")
	}

	// OS info
	info := a.system.OSInfo()
	fmt.Fprintf(&sysContent, "OS:%s/%s", info.OS, info.Arch)

	if sysContent.Len() > 0 {
		msgs = append(msgs, ChatMessage{Role: "system", Content: strings.TrimSpace(sysContent.String())})
	}

	// Koridor 4: static knowledge (berlaku selamanya, tidak berubah oleh conversation)
	var staticParts []string
	for _, m := range static {
		staticParts = append(staticParts, trunc(m.Text, maxSnip))
	}
	if len(staticParts) > 0 {
		msgs = append(msgs, ChatMessage{
			Role:    "system",
			Content: "Knowledge: " + strings.Join(staticParts, " | "),
		})
	}

	// Koridor 2 & 3: episodik background — short-term + long-term (deduplicate against session)
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
		role := m.Role
		if role == "" {
			role = "user" // backward-compat: old records without role field
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
