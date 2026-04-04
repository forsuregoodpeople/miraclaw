package orchestra

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

type skillEntry struct {
	desc    string
	handler func(ctx context.Context, input string) (string, error)
}

// SystemConfig holds optional validators injected into System.
type SystemConfig struct {
	CmdValidator func(string) error // optional: security.ValidateCommand
	URLValidator func(string) error // optional: security.ValidateURL
}

type System struct {
	skills       map[string]skillEntry
	cmdValidator func(string) error
	urlValidator func(string) error
}

type OSInfo struct {
	OS   string
	Arch string
}

func NewSystem(cfg SystemConfig) *System {
	return &System{
		skills:       make(map[string]skillEntry),
		cmdValidator: cfg.CmdValidator,
		urlValidator: cfg.URLValidator,
	}
}

func (s *System) Register(name, desc string, handler func(ctx context.Context, input string) (string, error)) {
	s.skills[name] = skillEntry{desc: desc, handler: handler}
}

func (s *System) Run(ctx context.Context, name, input string) (string, error) {
	sk, ok := s.skills[name]
	if !ok {
		return "", fmt.Errorf("skill %q not found", name)
	}
	return sk.handler(ctx, input)
}

func (s *System) SkillList() map[string]string {
	list := make(map[string]string, len(s.skills))
	for name, sk := range s.skills {
		list[name] = sk.desc
	}
	return list
}

// ValidateURL delegates to the configured URL validator, if any.
func (s *System) ValidateURL(rawURL string) error {
	if s.urlValidator == nil {
		return nil
	}
	return s.urlValidator(rawURL)
}

func (s *System) Exec(ctx context.Context, command string) (string, error) {
	if s.cmdValidator != nil {
		if err := s.cmdValidator(command); err != nil {
			return "", fmt.Errorf("command rejected: %w", err)
		}
	}
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return "", fmt.Errorf("empty command")
	}
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, parts[0], parts[1:]...)
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("exec %q: %w", command, err)
	}
	return strings.TrimSpace(out.String()), nil
}

func (s *System) ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}
	return string(data), nil
}

func (s *System) WriteFile(path, content string) error {
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

func (s *System) OSInfo() OSInfo {
	return OSInfo{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}
}
