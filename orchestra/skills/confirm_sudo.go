package skills

import (
	"context"
	"fmt"
	"strings"

	"github.com/miraclaw/orchestra"
)

// RegisterConfirmSudoSkill registers the confirm_sudo skill.
// The skill does NOT execute the command — it returns a sentinel string that
// Agent.Reply() detects to enter pending-confirmation mode. The actual exec
// happens only after the user confirms with yes/y/iya/ok/boleh.
func RegisterConfirmSudoSkill(sys *orchestra.System) {
	sys.Register("confirm_sudo",
		"ask user for confirmation before running a privileged/sudo command: input is the exact command",
		func(_ context.Context, input string) (string, error) {
			input = strings.TrimSpace(input)
			if input == "" {
				return "", fmt.Errorf("confirm_sudo: command cannot be empty")
			}
			return orchestra.ConfirmPendingPrefix + input, nil
		},
	)
}
