package skills_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra/skills"
)

func TestExecShBuiltin(t *testing.T) {
	sys := newSystem()
	skills.RegisterExecSkill(sys)

	// sh -c should handle builtins and chaining
	result, err := sys.Run(context.Background(), "exec", "echo hello && echo world")
	if err != nil {
		t.Fatalf("exec skill error: %v", err)
	}
	if !strings.Contains(result, "hello") || !strings.Contains(result, "world") {
		t.Errorf("expected 'hello' and 'world' in result, got %q", result)
	}
}

func TestExecPipe(t *testing.T) {
	sys := newSystem()
	skills.RegisterExecSkill(sys)

	result, err := sys.Run(context.Background(), "exec", "echo -e 'foo\nbar\nbaz' | grep bar")
	if err != nil {
		t.Fatalf("exec pipe error: %v", err)
	}
	if !strings.Contains(result, "bar") {
		t.Errorf("expected 'bar' in result, got %q", result)
	}
}
