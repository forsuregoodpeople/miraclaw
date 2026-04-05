package skills_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

func TestConfirmSudoReturnsSentinel(t *testing.T) {
	sys := newSystem()
	skills.RegisterConfirmSudoSkill(sys)

	result, err := sys.Run(context.Background(), "confirm_sudo", "sudo pacman -Syu")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.HasPrefix(result, orchestra.ConfirmPendingPrefix) {
		t.Errorf("expected prefix %q, got %q", orchestra.ConfirmPendingPrefix, result)
	}
	if !strings.Contains(result, "sudo pacman -Syu") {
		t.Errorf("expected command in result, got %q", result)
	}
}

func TestConfirmSudoEmptyInputError(t *testing.T) {
	sys := newSystem()
	skills.RegisterConfirmSudoSkill(sys)

	_, err := sys.Run(context.Background(), "confirm_sudo", "")
	if err == nil {
		t.Fatal("expected error for empty input, got nil")
	}
}

func TestConfirmSudoCommandPreservedVerbatim(t *testing.T) {
	sys := newSystem()
	skills.RegisterConfirmSudoSkill(sys)

	cmd := "sudo systemctl restart nginx"
	result, err := sys.Run(context.Background(), "confirm_sudo", cmd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := strings.TrimPrefix(result, orchestra.ConfirmPendingPrefix)
	if got != cmd {
		t.Errorf("expected command %q verbatim, got %q", cmd, got)
	}
}
