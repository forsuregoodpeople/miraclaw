package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
)

// RegisterExecSkill registers the exec skill — runs any shell command via sh -c.
func RegisterExecSkill(sys *orchestra.System) {
	sys.Register("exec", "run any shell command via sh -c (builtins, pipes, && all work): input is the command", func(ctx context.Context, input string) (string, error) {
		return sys.Exec(ctx, input)
	})
}

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

// parseTimeIntoCron converts common time formats to a 5-field cron expression.
// Valid 5-field cron strings pass through unchanged.
// Supported formats: "HH:MM" (24h), "H:MM AM/PM".
func parseTimeIntoCron(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", fmt.Errorf("empty cron/time expression")
	}
	// Already a 5-field cron expression?
	if fields := strings.Fields(s); len(fields) == 5 {
		return s, nil
	}

	// Normalise case for AM/PM suffix
	upper := strings.ToUpper(s)
	var timePart string
	var pm, am bool
	switch {
	case strings.HasSuffix(upper, " PM"):
		timePart = strings.TrimSpace(s[:len(s)-3])
		pm = true
	case strings.HasSuffix(upper, " AM"):
		timePart = strings.TrimSpace(s[:len(s)-3])
		am = true
	default:
		timePart = s
	}
	_ = am

	parts := strings.SplitN(timePart, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("unrecognised time/cron format %q — use 5-field cron (e.g. '0 9 * * *') or HH:MM", s)
	}
	h, errH := strconv.Atoi(strings.TrimSpace(parts[0]))
	m, errM := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errH != nil || errM != nil {
		return "", fmt.Errorf("invalid time %q: hour and minute must be numbers", s)
	}
	if m < 0 || m > 59 {
		return "", fmt.Errorf("invalid minute %d in %q (must be 0-59)", m, s)
	}
	// Convert 12h AM/PM to 24h
	if pm {
		if h != 12 {
			h += 12
		}
	} else if strings.ToUpper(s)[len(s)-3:] == " AM" {
		if h == 12 {
			h = 0
		}
	}
	if h < 0 || h > 23 {
		return "", fmt.Errorf("invalid hour %d in %q (must be 0-23)", h, s)
	}
	return fmt.Sprintf("%d %d * * *", m, h), nil
}

// SchedulerUpdater is the runtime scheduler API consumed by schedule skills.
type SchedulerUpdater interface {
	AddRule(ctx context.Context, rule config.ScheduleRule) error
	RemoveRule(index int) error
	Rules() []config.ScheduleRule
}

// RegisterScheduleSkills registers skills for managing scheduled reminders at runtime.
// chatID is the Telegram chat ID to associate with new rules.
// saveFn is called after every mutation to persist the updated rule list.
func RegisterScheduleSkills(sys *orchestra.System, sched SchedulerUpdater, chatID int64, saveFn func() error) {
	sys.Register("create_schedule",
		"schedule: cron|||prompt (e.g.0 9 * * *)",
		func(ctx context.Context, input string) (string, error) {
			cronExpr, prompt, ok := strings.Cut(input, "|||")
			if !ok {
				return "", fmt.Errorf("create_schedule: input must be 'cron|||prompt'")
			}
			cronExpr = strings.TrimSpace(cronExpr)
			prompt = strings.TrimSpace(prompt)
			if cronExpr == "" || prompt == "" {
				return "", fmt.Errorf("create_schedule: cron and prompt must not be empty")
			}
			var err error
			cronExpr, err = parseTimeIntoCron(cronExpr)
			if err != nil {
				return "", fmt.Errorf("create_schedule: %w", err)
			}
			rule := config.ScheduleRule{Cron: cronExpr, Prompt: prompt, ChatID: chatID}
			if err := sched.AddRule(ctx, rule); err != nil {
				return "", fmt.Errorf("create_schedule: %w", err)
			}
			if err := saveFn(); err != nil {
				return "", fmt.Errorf("create_schedule: saved to runtime but failed to persist: %w", err)
			}
			return fmt.Sprintf("Schedule created: [%s] %s", cronExpr, prompt), nil
		},
	)

	sys.Register("list_schedules",
		"list all active scheduled reminders; input is ignored",
		func(_ context.Context, _ string) (string, error) {
			rules := sched.Rules()
			if len(rules) == 0 {
				return "No active schedules.", nil
			}
			var sb strings.Builder
			for i, r := range rules {
				fmt.Fprintf(&sb, "%d. [%s] %s\n", i, r.Cron, r.Prompt)
			}
			return strings.TrimSpace(sb.String()), nil
		},
	)

	sys.Register("delete_schedule",
		"delete a scheduled reminder by index; input: number (see list_schedules for index)",
		func(_ context.Context, input string) (string, error) {
			input = strings.TrimSpace(input)
			idx, err := strconv.Atoi(input)
			if err != nil {
				return "", fmt.Errorf("delete_schedule: input must be a number, got %q", input)
			}
			rules := sched.Rules()
			if idx < 0 || idx >= len(rules) {
				return "", fmt.Errorf("delete_schedule: index %d out of range (have %d schedules)", idx, len(rules))
			}
			removed := rules[idx]
			if err := sched.RemoveRule(idx); err != nil {
				return "", fmt.Errorf("delete_schedule: %w", err)
			}
			if err := saveFn(); err != nil {
				return "", fmt.Errorf("delete_schedule: removed from runtime but failed to persist: %w", err)
			}
			return fmt.Sprintf("Schedule deleted: [%s] %s", removed.Cron, removed.Prompt), nil
		},
	)
}

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

// WebSearch queries DuckDuckGo Instant Answer API (no API key required).
// Register manually if needed:
//
//	sys.Register("websearch", "search the web: input is the query", func(ctx context.Context, input string) (string, error) {
//	    return skills.WebSearch(ctx, input)
//	})
func WebSearch(ctx context.Context, query string) (string, error) {
	endpoint := "https://api.duckduckgo.com/?q=" + url.QueryEscape(query) + "&format=json&no_html=1&skip_disambig=1"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("websearch: build request: %w", err)
	}
	req.Header.Set("User-Agent", "MiraClaw/1.0")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("websearch: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return "", fmt.Errorf("websearch: read body: %w", err)
	}

	var result struct {
		AbstractText string `json:"AbstractText"`
		Answer       string `json:"Answer"`
		Definition   string `json:"Definition"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("websearch: parse response: %w", err)
	}

	if result.Answer != "" {
		return result.Answer, nil
	}
	if result.AbstractText != "" {
		return result.AbstractText, nil
	}
	if result.Definition != "" {
		return result.Definition, nil
	}
	return "No results found for: " + query, nil
}
