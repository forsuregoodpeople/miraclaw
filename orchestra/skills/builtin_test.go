package skills_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

type mockStaticMemory struct {
	stored []string
}

func (m *mockStaticMemory) AddStatic(_ context.Context, _, text, _ string) error {
	m.stored = append(m.stored, text)
	return nil
}

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

func TestSysinfoAllOrEmpty(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	for _, input := range []string{"", "all"} {
		result, err := sys.Run(context.Background(), "sysinfo", input)
		if err != nil {
			t.Fatalf("sysinfo %q error: %v", input, err)
		}
		for _, want := range []string{"RAM:", "CPU:", "Disk ("} {
			if !strings.Contains(result, want) {
				t.Errorf("sysinfo %q: expected %q in result, got: %s", input, want, result)
			}
		}
	}
}

func TestSysinfoRAM(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "sysinfo", "ram")
	if err != nil {
		t.Fatalf("sysinfo ram error: %v", err)
	}
	if !strings.Contains(result, "RAM:") {
		t.Errorf("expected 'RAM:' in result, got: %s", result)
	}
	if strings.Contains(result, "CPU:") || strings.Contains(result, "Disk:") {
		t.Errorf("sysinfo ram should not contain CPU/Disk sections, got: %s", result)
	}
}

func TestSysinfoCPU(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "sysinfo", "cpu")
	if err != nil {
		t.Fatalf("sysinfo cpu error: %v", err)
	}
	if !strings.Contains(result, "CPU:") {
		t.Errorf("expected 'CPU:' in result, got: %s", result)
	}
	if strings.Contains(result, "RAM:") || strings.Contains(result, "Disk:") {
		t.Errorf("sysinfo cpu should not contain RAM/Disk sections, got: %s", result)
	}
}

func TestSysinfoDisk(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	result, err := sys.Run(context.Background(), "sysinfo", "disk")
	if err != nil {
		t.Fatalf("sysinfo disk error: %v", err)
	}
	if !strings.Contains(result, "Disk (") {
		t.Errorf("expected 'Disk (' in result, got: %s", result)
	}
	if strings.Contains(result, "RAM:") || strings.Contains(result, "CPU:") {
		t.Errorf("sysinfo disk should not contain RAM/CPU sections, got: %s", result)
	}
}

func TestRegisterAllSkills(t *testing.T) {
	sys := newSystem()
	skills.RegisterAll(sys)

	list := sys.SkillList()
	expected := []string{"datetime", "exec", "readfile", "writefile", "sysinfo"}
	for _, name := range expected {
		if _, ok := list[name]; !ok {
			t.Errorf("expected skill %q to be registered", name)
		}
	}
}

func TestRememberSkill(t *testing.T) {
	sys := newSystem()
	mem := &mockStaticMemory{}
	skills.RegisterMemorySkills(sys, mem)

	result, err := sys.Run(context.Background(), "remember", "nama saya adalah Mira")
	if err != nil {
		t.Fatalf("remember skill error: %v", err)
	}
	if !strings.Contains(result, "Saved") {
		t.Errorf("expected saved confirmation, got %q", result)
	}
	if len(mem.stored) == 0 {
		t.Error("expected AddStatic to be called")
	}
	if mem.stored[0] != "nama saya adalah Mira" {
		t.Errorf("expected stored text %q, got %q", "nama saya adalah Mira", mem.stored[0])
	}
}
