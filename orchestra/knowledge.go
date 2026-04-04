package orchestra

import (
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// IdentityCategory is the Qdrant static category for bot identity fields
// (name, language, persona). Always fetched by exact match, never by vector search.
const IdentityCategory = "identity"

// builtinKnowledge are the default knowledge sections seeded into Qdrant static
// on every startup (idempotent via stable IDs). No external file needed.
var builtinKnowledge = []struct{ heading, body string }{
	{
		heading: "Skill Usage",
		body: `When the user asks you to perform an action that matches a skill, reply EXACTLY with:
SKILL:<skill-name>:<input>

Do not use native tool use. SKILL:name:input is the only dispatch format.
When user asks to remember or save information → always call SKILL:remember:<text>.`,
	},
	{
		heading: "Memory",
		body: `SKILL:remember and SKILL:set_identity are background skills — add them on their own line in your reply and they run silently without replacing your reply.
Use SKILL:remember:<text> whenever the user shares: their name, preferences, facts about themselves, things they like/dislike, where they live/work, contact info, or explicitly asks you to remember something.
Use SKILL:clear_memory to wipe all memory when asked.
Example reply when user says "saya suka kopi hitam":
Noted!

SKILL:remember:user suka kopi hitam`,
	},
	{
		heading: "Scheduling",
		body: `To create a recurring scheduled reminder use SKILL:create_schedule:<cron>|||<prompt>
Cron format is EXACTLY 5 space-separated fields: MINUTE HOUR * * WEEKDAY
WEEKDAY: * = every day, 1-5 = Mon-Fri, 1 = Monday, 0 or 7 = Sunday
Examples:
  Every day 9 AM:    SKILL:create_schedule:0 9 * * *|||Good morning!
  Weekdays 9 AM:     SKILL:create_schedule:0 9 * * 1-5|||Selamat pagi!
  Daily 10 PM:       SKILL:create_schedule:0 22 * * *|||Evening check-in
  Every Mon 8 AM:    SKILL:create_schedule:0 8 * * 1|||Weekly planning
  Every day 7:30 AM: SKILL:create_schedule:30 7 * * *|||Reminder
User says "ingatkan aku jam 9 pagi" → SKILL:create_schedule:0 9 * * *|||<teks reminder>
User says "remind me at 3 PM daily" → SKILL:create_schedule:0 15 * * *|||<reminder text>
IMPORTANT: the cron field must be 5 fields separated by spaces, NOT "HH:MM" format.`,
	},
}

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
		lines = append(lines, "name: "+n)
	}
	if l, ok2 := fields["language"]; ok2 {
		lines = append(lines, "language: "+l)
	}
	for k, v := range fields {
		if k != "name" && k != "language" {
			lines = append(lines, k+": "+v)
		}
	}
	text := strings.Join(lines, "\n")
	if err := mem.AddStatic(ctx, IdentityID, text, IdentityCategory); err != nil {
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
	text := "name: " + botName
	if err := mem.AddStatic(ctx, IdentityID, text, IdentityCategory); err != nil {
		log.Printf("warn: knowledge: seed identity: %v", err)
		return
	}
	log.Printf("knowledge: identity seeded (name=%s)", botName)
}

// SeedKnowledge upserts the built-in knowledge sections into Qdrant static.
// Safe to call on every startup — uses stable IDs so it is fully idempotent.
func SeedKnowledge(ctx context.Context, mem KnowledgeSeeder) {
	for _, s := range builtinKnowledge {
		id := knowledgeID(s.heading)
		content := s.heading + "\n" + s.body
		if err := mem.AddStatic(ctx, id, content, "knowledge"); err != nil {
			log.Printf("warn: knowledge: seed %q: %v", s.heading, err)
		}
	}
	log.Printf("knowledge: seeded %d sections", len(builtinKnowledge))
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
		if err := mem.AddStatic(ctx, id, s.content, "knowledge"); err != nil {
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
	return fmt.Sprintf("knowledge-%08x", h.Sum32())
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
