package skills

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/miraclaw/config"
	"github.com/miraclaw/orchestra"
)

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
