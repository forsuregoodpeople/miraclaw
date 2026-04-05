package orchestra

import (
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/miraclaw/config/prompts"
)

// IdentityCategory is re-exported from prompts for backward compatibility.
const IdentityCategory = prompts.IdentityCategory

// KnowledgeSeeder is the subset of AgentMemory needed for seeding static knowledge.
type KnowledgeSeeder interface {
	AddStatic(ctx context.Context, id, text, category string) error
	GetStaticByCategory(ctx context.Context, category string) ([]*Message, error)
}

// IdentityID is the stable Qdrant point ID for the bot identity record.
const IdentityID = "identity-bot"

// UpdateIdentity merges a single field:value into the existing identity record
// and persists it. This is the canonical implementation used by both the
// set_identity skill and the /identity slash command.
func UpdateIdentity(ctx context.Context, mem KnowledgeSeeder, fieldValue string) (string, error) {
	fieldValue = strings.TrimSpace(fieldValue)
	if fieldValue == "" {
		return "", fmt.Errorf("identity: input cannot be empty")
	}
	field, value, ok := strings.Cut(fieldValue, ":")
	if !ok {
		field, value = "name", fieldValue
	}
	field = strings.ToLower(strings.TrimSpace(field))
	value = strings.TrimSpace(value)

	existing, err := mem.GetStaticByCategory(ctx, IdentityCategory)
	if err != nil {
		return "", fmt.Errorf("identity: read existing: %w", err)
	}
	fields := map[string]string{}
	for _, m := range existing {
		for _, line := range strings.Split(m.Text, "\n") {
			if k, v, ok2 := strings.Cut(line, ":"); ok2 {
				fields[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
			}
		}
	}
	switch field {
	case "name":
		fields["name"] = value
	case "language", "lang":
		fields["language"] = value
	default:
		fields[field] = value
	}
	var lines []string
	if n, ok2 := fields["name"]; ok2 {
		lines = append(lines, fmt.Sprintf(prompts.IdentityNameFormat, n))
	}
	if l, ok2 := fields["language"]; ok2 {
		lines = append(lines, fmt.Sprintf(prompts.IdentityLanguageFormat, l))
	}
	for k, v := range fields {
		if k != "name" && k != "language" {
			lines = append(lines, k+": "+v)
		}
	}
	text := strings.Join(lines, prompts.IdentityLineSeparator)
	if err := mem.AddStatic(ctx, prompts.IdentityID, text, IdentityCategory); err != nil {
		return "", fmt.Errorf("identity: save: %w", err)
	}
	return field + " = " + value, nil
}

// SeedIdentity seeds the bot identity into Qdrant static only if no identity
// record exists yet. This preserves any updates the user made via chat.
func SeedIdentity(ctx context.Context, mem KnowledgeSeeder, botName string) {
	if botName == "" {
		return
	}
	existing, err := mem.GetStaticByCategory(ctx, IdentityCategory)
	if err != nil {
		log.Printf("warn: knowledge: check identity: %v", err)
		return
	}
	if len(existing) > 0 {
		log.Printf("knowledge: identity already set, skipping seed")
		return
	}
	text := fmt.Sprintf(prompts.IdentityNameFormat, botName)
	if err := mem.AddStatic(ctx, prompts.IdentityID, text, IdentityCategory); err != nil {
		log.Printf("warn: knowledge: seed identity: %v", err)
		return
	}
	log.Printf("knowledge: identity seeded (name=%s)", botName)
}

// SeedKnowledge upserts the built-in knowledge sections into Qdrant static.
// Safe to call on every startup — uses stable IDs so it is fully idempotent.
func SeedKnowledge(ctx context.Context, mem KnowledgeSeeder) {
	for _, s := range prompts.BuiltinKnowledge {
		id := knowledgeID(s.Heading)
		content := s.Heading + "\n" + s.Body
		if err := mem.AddStatic(ctx, id, content, prompts.KnowledgeCategory); err != nil {
			log.Printf("warn: knowledge: seed %q: %v", s.Heading, err)
		}
	}
	log.Printf("knowledge: seeded %d sections", len(prompts.BuiltinKnowledge))
}

// LoadKnowledgeFile reads a text file at path, splits it into sections by "## "
// headings, and upserts each into Qdrant static (idempotent).
// Optional — used when the user provides a custom knowledge file via config.
func LoadKnowledgeFile(ctx context.Context, path string, mem KnowledgeSeeder) error {
	path = expandHome(path)

	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("knowledge: read %s: %w", path, err)
	}

	sections := splitSections(string(data))
	for _, s := range sections {
		id := knowledgeID(s.heading)
		if err := mem.AddStatic(ctx, id, s.content, prompts.KnowledgeCategory); err != nil {
			log.Printf("warn: knowledge: upsert %q: %v", s.heading, err)
		}
	}
	log.Printf("knowledge: loaded %d sections from %s", len(sections), path)
	return nil
}

type knowledgeSection struct {
	heading string
	content string
}

// splitSections splits text into sections by "## " level-2 headings.
func splitSections(text string) []knowledgeSection {
	var sections []knowledgeSection
	lines := strings.Split(text, "\n")

	var currentHeading string
	var currentLines []string

	flush := func() {
		content := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if content != "" {
			sections = append(sections, knowledgeSection{
				heading: currentHeading,
				content: currentHeading + "\n" + content,
			})
		}
	}

	for _, line := range lines {
		if strings.HasPrefix(line, "## ") {
			flush()
			currentHeading = strings.TrimSpace(line)
			currentLines = nil
		} else if strings.HasPrefix(line, "# ") && currentHeading == "" {
			currentHeading = strings.TrimSpace(line)
		} else {
			currentLines = append(currentLines, line)
		}
	}
	flush()

	return sections
}

// knowledgeID returns a stable Qdrant point ID for a section heading (FNV-32a).
func knowledgeID(heading string) string {
	h := fnv.New32a()
	h.Write([]byte(heading))
	return fmt.Sprintf("%s%08x", prompts.KnowledgeIDPrefix, h.Sum32())
}

// expandHome expands a leading "~" to the user's home directory.
func expandHome(path string) string {
	if !strings.HasPrefix(path, "~") {
		return path
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return path
	}
	return filepath.Join(home, path[1:])
}
