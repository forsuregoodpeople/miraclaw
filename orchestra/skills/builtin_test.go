package skills_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

func newSystem() *orchestra.System {
	return orchestra.NewSystem(orchestra.SystemConfig{})
}

func TestDatetimeSkill(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "datetime", "")
	if err != nil {
		t.Fatalf("datetime skill error: %v", err)
	}
	// Should parse as RFC3339
	_, parseErr := time.Parse(time.RFC3339, result)
	if parseErr != nil {
		t.Errorf("datetime result %q is not RFC3339: %v", result, parseErr)
	}
}

func TestWebSearchSkill(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "websearch", "golang")
	if err != nil {
		t.Fatalf("websearch skill error: %v", err)
	}
	if result == "" {
		t.Error("expected non-empty websearch result")
	}
}

func TestExecSkill(t *testing.T) {
	sys := orchestra.NewSystem(orchestra.SystemConfig{
		CmdValidator: nil, // no restriction in test
	})
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "exec", "echo hello")
	if err != nil {
		t.Fatalf("exec skill error: %v", err)
	}
	if !strings.Contains(result, "hello") {
		t.Errorf("expected 'hello' in exec result, got %q", result)
	}
}

func TestReadWriteFileSkill(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	tmpFile := t.TempDir() + "/test.txt"

	// Write
	_, err := sys.Run(context.Background(), "writefile", tmpFile+"\nhello world")
	if err != nil {
		t.Fatalf("writefile skill error: %v", err)
	}

	// Read
	result, err := sys.Run(context.Background(), "readfile", tmpFile)
	if err != nil {
		t.Fatalf("readfile skill error: %v", err)
	}
	if !strings.Contains(result, "hello world") {
		t.Errorf("expected 'hello world', got %q", result)
	}
}

func TestRegisterAllSkills(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	list := sys.SkillList()
	expected := []string{"datetime", "websearch", "exec", "readfile", "writefile"}
	for _, name := range expected {
		if _, ok := list[name]; !ok {
			t.Errorf("expected skill %q to be registered", name)
		}
	}
}
