package skills

import (
	"context"

	"github.com/miraclaw/orchestra"
)

// RegisterExecSkill registers the exec skill — runs any shell command via sh -c.
func RegisterExecSkill(sys *orchestra.System) {
	sys.Register("exec", "run any shell command via sh -c (builtins, pipes, && all work): input is the command", func(ctx context.Context, input string) (string, error) {
		return sys.Exec(ctx, input)
	})
}
