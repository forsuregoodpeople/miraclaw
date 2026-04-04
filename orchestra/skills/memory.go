package skills

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/miraclaw/orchestra"
)

// staticMemory is the minimal interface needed by RegisterMemorySkills.
type staticMemory interface {
	AddStatic(ctx context.Context, id, text, category string) error
	GetStaticByCategory(ctx context.Context, category string) ([]*orchestra.Message, error)
}

// MemoryWithPromote is the interface needed for promote skill.
type MemoryWithPromote interface {
	staticMemory
	PromoteToLongTerm(ctx context.Context, msgID string) error
	ClearAll(ctx context.Context) error
}

// RegisterMemorySkills registers memory-aware skills that require access to the memory store.
func RegisterMemorySkills(sys *orchestra.System, mem MemoryWithPromote) {
	sys.Register("remember", "save information to long-term memory: input is the text to remember", func(ctx context.Context, input string) (string, error) {
		input = strings.TrimSpace(input)
		if input == "" {
			return "", fmt.Errorf("remember: input cannot be empty")
		}
		id := fmt.Sprintf("mem-%d", time.Now().UnixNano())
		if err := mem.AddStatic(ctx, id, input, "user"); err != nil {
			return "", fmt.Errorf("remember: %w", err)
		}
		return "Saved to memory: " + input, nil
	})

	sys.Register("get_identity", "read current bot identity (name, language, persona) from memory: input is ignored", func(ctx context.Context, _ string) (string, error) {
		items, err := mem.GetStaticByCategory(ctx, orchestra.IdentityCategory)
		if err != nil {
			return "", fmt.Errorf("get_identity: %w", err)
		}
		if len(items) == 0 {
			return "No identity set.", nil
		}
		var parts []string
		for _, m := range items {
			parts = append(parts, m.Text)
		}
		return strings.Join(parts, "\n"), nil
	})

	sys.Register("set_identity", "update bot identity (name, language, persona): input is 'field:value', e.g. 'name:Mira' or 'language:Indonesian'", func(ctx context.Context, input string) (string, error) {
		result, err := orchestra.UpdateIdentity(ctx, mem, input)
		if err != nil {
			return "", fmt.Errorf("set_identity: %w", err)
		}
		return "Identity updated: " + result, nil
	})

	sys.Register("clear_memory", "wipe all Qdrant memory collections (session, short-term, long-term, static): input is ignored", func(ctx context.Context, _ string) (string, error) {
		if err := mem.ClearAll(ctx); err != nil {
			return "", fmt.Errorf("clear_memory: %w", err)
		}
		return "All memory cleared.", nil
	})

	sys.Register("promote", "promote a message from short-term to long-term memory: input is the message ID", func(ctx context.Context, input string) (string, error) {
		input = strings.TrimSpace(input)
		if input == "" {
			return "", fmt.Errorf("promote: input cannot be empty")
		}
		if err := mem.PromoteToLongTerm(ctx, input); err == nil {
			return "✓ Promoted to long-term memory: " + input, nil
		}
		return "", fmt.Errorf("promote: could not find message with ID '%s' in short-term memory", input)
	})
}
