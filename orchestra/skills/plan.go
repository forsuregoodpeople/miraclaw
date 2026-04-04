package skills

import (
	"context"
	"fmt"
	"hash/fnv"
	"strings"

	"github.com/miraclaw/orchestra"
)

// PlanMemory is the minimal interface needed by RegisterPlanSkills.
type PlanMemory interface {
	AddStatic(ctx context.Context, id, text, category string) error
	GetStaticByCategory(ctx context.Context, category string) ([]*orchestra.Message, error)
}

// RegisterPlanSkills registers skills for managing task/project plans in static memory.
func RegisterPlanSkills(sys *orchestra.System, mem PlanMemory) {
	sys.Register("plan_add",
		"create or save a plan/task list; input: title|||tasks (one per line)",
		func(ctx context.Context, input string) (string, error) {
			title, content, ok := strings.Cut(input, "|||")
			if !ok {
				return "", fmt.Errorf("plan_add: input must be 'title|||tasks'")
			}
			title = strings.TrimSpace(title)
			content = strings.TrimSpace(content)
			if title == "" {
				return "", fmt.Errorf("plan_add: title must not be empty")
			}
			id := planID(title)
			text := title + "\n" + content
			if err := mem.AddStatic(ctx, id, text, "plan"); err != nil {
				return "", fmt.Errorf("plan_add: %w", err)
			}
			return fmt.Sprintf("Plan saved: %s", title), nil
		},
	)

	sys.Register("plan_get",
		"retrieve all plans or a specific plan; input: optional title filter",
		func(ctx context.Context, input string) (string, error) {
			items, err := mem.GetStaticByCategory(ctx, "plan")
			if err != nil {
				return "", fmt.Errorf("plan_get: %w", err)
			}
			if len(items) == 0 {
				return "No plans saved yet.", nil
			}
			filter := strings.TrimSpace(strings.ToLower(input))
			var sb strings.Builder
			for _, m := range items {
				if filter == "" || strings.Contains(strings.ToLower(m.Text), filter) {
					fmt.Fprintf(&sb, "%s\n\n", m.Text)
				}
			}
			result := strings.TrimSpace(sb.String())
			if result == "" {
				return "No plans matching: " + input, nil
			}
			return result, nil
		},
	)

	sys.Register("plan_update",
		"update an existing plan; input: title|||new content (replaces existing)",
		func(ctx context.Context, input string) (string, error) {
			title, content, ok := strings.Cut(input, "|||")
			if !ok {
				return "", fmt.Errorf("plan_update: input must be 'title|||new content'")
			}
			title = strings.TrimSpace(title)
			content = strings.TrimSpace(content)
			if title == "" {
				return "", fmt.Errorf("plan_update: title must not be empty")
			}
			id := planID(title)
			text := title + "\n" + content
			if err := mem.AddStatic(ctx, id, text, "plan"); err != nil {
				return "", fmt.Errorf("plan_update: %w", err)
			}
			return fmt.Sprintf("Plan updated: %s", title), nil
		},
	)
}

// planID returns a stable ID for a plan title using FNV-32a hash.
func planID(title string) string {
	h := fnv.New32a()
	h.Write([]byte(strings.ToLower(strings.TrimSpace(title))))
	return fmt.Sprintf("plan-%x", h.Sum32())
}
