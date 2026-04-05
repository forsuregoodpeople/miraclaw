// Package orchestra provides token-efficient prompt loading from Qdrant.
// Only loads essential content into system prompt, rest retrieved on-demand.
package orchestra

import (
	"context"
	"fmt"
	"strings"
)

// PromptLoader handles loading prompts from Qdrant with token efficiency
type PromptLoader struct {
	mem AgentMemory
}

// NewPromptLoader creates a new PromptLoader
func NewPromptLoader(mem AgentMemory) *PromptLoader {
	return &PromptLoader{mem: mem}
}

// LoadMinimalSystemPrompt loads only essential prompts (token efficient)
// Categories loaded: core, user (small), skills (summarized)
// Categories NOT loaded: knowledge, examples (retrieved on-demand)
func (pl *PromptLoader) LoadMinimalSystemPrompt(ctx context.Context) ([]ChatMessage, error) {
	var msgs []ChatMessage

	// 1. Core persona (always, ~500 chars)
	core, err := pl.mem.GetStaticByCategory(ctx, "core")
	if err != nil {
		return nil, fmt.Errorf("load core: %w", err)
	}
	if len(core) > 0 {
		content := pl.joinSections(core)
		msgs = append(msgs, ChatMessage{
			Role:    "system",
			Content: content,
		})
	}

	// 2. User preferences (always, ~200 chars)
	userPrefs, err := pl.mem.GetStaticByCategory(ctx, "user")
	if err != nil {
		return nil, fmt.Errorf("load user prefs: %w", err)
	}
	if len(userPrefs) > 0 {
		content := "User preferences:\n" + pl.joinSections(userPrefs)
		msgs = append(msgs, ChatMessage{
			Role:    "system",
			Content: content,
		})
	}

	// 3. Skills (summarized, ~1KB)
	skills, err := pl.mem.GetStaticByCategory(ctx, "skills")
	if err != nil {
		return nil, fmt.Errorf("load skills: %w", err)
	}
	if len(skills) > 0 {
		summary := pl.summarizeSkills(skills)
		msgs = append(msgs, ChatMessage{
			Role:    "system",
			Content: summary,
		})
	}

	return msgs, nil
}

// LoadCategory loads all content from a specific category
func (pl *PromptLoader) LoadCategory(ctx context.Context, category string) (string, error) {
	sections, err := pl.mem.GetStaticByCategory(ctx, category)
	if err != nil {
		return "", err
	}
	return pl.joinSections(sections), nil
}

// SearchKnowledge performs semantic search for relevant knowledge
// Use this for knowledge category instead of loading all
func (pl *PromptLoader) SearchKnowledge(ctx context.Context, query string, topN uint64) ([]ChatMessage, error) {
	results, err := pl.mem.Search(ctx, "", query, topN)
	if err != nil {
		return nil, err
	}

	var msgs []ChatMessage
	for _, r := range results {
		if r.Text != "" {
			msgs = append(msgs, ChatMessage{
				Role:    "system",
				Content: "Knowledge: " + truncate(r.Text, 500),
			})
		}
	}

	return msgs, nil
}

// GetExamples retrieves few-shot examples if needed
func (pl *PromptLoader) GetExamples(ctx context.Context, maxExamples int) ([]ChatMessage, error) {
	examples, err := pl.mem.GetStaticByCategory(ctx, "examples")
	if err != nil {
		return nil, err
	}

	var msgs []ChatMessage
	for i, ex := range examples {
		if i >= maxExamples {
			break
		}
		if ex.Text != "" {
			msgs = append(msgs, ChatMessage{
				Role:    "system",
				Content: "Example:\n" + ex.Text,
			})
		}
	}

	return msgs, nil
}

// joinSections combines multiple message texts
func (pl *PromptLoader) joinSections(sections []*Message) string {
	var parts []string
	for _, s := range sections {
		if s.Text != "" {
			parts = append(parts, strings.TrimSpace(s.Text))
		}
	}
	return strings.Join(parts, "\n\n")
}

// summarizeSkills creates a compact skills summary for system prompt
func (pl *PromptLoader) summarizeSkills(skills []*Message) string {
	var b strings.Builder
	b.WriteString("You have skills:\n")

	for _, s := range skills {
		lines := strings.Split(s.Text, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			// Extract skill name and brief description
			if strings.HasPrefix(line, "## ") {
				b.WriteString("- ")
				b.WriteString(strings.TrimPrefix(line, "## "))
				b.WriteByte('\n')
			} else if strings.HasPrefix(line, "- ") && len(line) < 100 {
				// Keep short bullet points
				b.WriteString(line)
				b.WriteByte('\n')
			}
		}
	}

	b.WriteString("\nUse SKILL:<name>:<input> format to call skills.")
	return b.String()
}

// truncate truncates text to max length with ellipsis
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
