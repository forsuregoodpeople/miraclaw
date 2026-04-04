package skills_test

import (
	"context"
	"strings"
	"testing"

	"github.com/miraclaw/orchestra"
	"github.com/miraclaw/orchestra/skills"
)

type mockStaticMemory struct {
	stored   []string
	identity string // last stored identity text (id="identity-bot")
}

func (m *mockStaticMemory) AddStatic(_ context.Context, id, text, _ string) error {
	if id == orchestra.IdentityID {
		m.identity = text
	} else {
		m.stored = append(m.stored, text)
	}
	return nil
}

func (m *mockStaticMemory) GetStaticByCategory(_ context.Context, category string) ([]*orchestra.Message, error) {
	if category == orchestra.IdentityCategory && m.identity != "" {
		return []*orchestra.Message{{Text: m.identity}}, nil
	}
	return nil, nil
}

func (m *mockStaticMemory) PromoteToLongTerm(_ context.Context, _ string) error {
	return nil
}

func (m *mockStaticMemory) ClearAll(_ context.Context) error {
	m.stored = nil
	m.identity = ""
	return nil
}

func newSystem() *orchestra.System {
	return orchestra.NewSystem(orchestra.SystemConfig{})
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

// TestSetIdentityNamePersistence verifies that updating language does not wipe the name.
func TestSetIdentityNamePersistence(t *testing.T) {
	sys := newSystem()
	mem := &mockStaticMemory{}
	skills.RegisterMemorySkills(sys, mem)

	if _, err := sys.Run(context.Background(), "set_identity", "name:Sara"); err != nil {
		t.Fatalf("set_identity name error: %v", err)
	}
	if _, err := sys.Run(context.Background(), "set_identity", "language:Indonesian"); err != nil {
		t.Fatalf("set_identity language error: %v", err)
	}

	if !strings.Contains(mem.identity, "Sara") {
		t.Errorf("expected name 'Sara' to persist after language update, got identity: %q", mem.identity)
	}
	if !strings.Contains(mem.identity, "Indonesian") {
		t.Errorf("expected language 'Indonesian' in identity, got: %q", mem.identity)
	}
}

// TestSetIdentityRoundTrip verifies parse → store → parse is consistent (no data loss on re-update).
func TestSetIdentityRoundTrip(t *testing.T) {
	sys := newSystem()
	mem := &mockStaticMemory{}
	skills.RegisterMemorySkills(sys, mem)

	if _, err := sys.Run(context.Background(), "set_identity", "name:Sara"); err != nil {
		t.Fatalf("set_identity error: %v", err)
	}
	if _, err := sys.Run(context.Background(), "set_identity", "language:Indonesian"); err != nil {
		t.Fatalf("set_identity error: %v", err)
	}
	if _, err := sys.Run(context.Background(), "set_identity", "name:Mira"); err != nil {
		t.Fatalf("set_identity error: %v", err)
	}

	if !strings.Contains(mem.identity, "Mira") {
		t.Errorf("expected updated name 'Mira', got: %q", mem.identity)
	}
	if !strings.Contains(mem.identity, "Indonesian") {
		t.Errorf("expected language 'Indonesian' to persist after name update, got: %q", mem.identity)
	}
}
