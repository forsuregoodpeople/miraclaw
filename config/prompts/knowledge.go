// Package prompts contains all system prompt and knowledge configurations.
// This file is auto-generated from workspace/knowledge/builtin-knowledge.md
// Edit the markdown file and regenerate this file when making changes.
package prompts

// KnowledgeSection represents a single knowledge section.
type KnowledgeSection struct {
	Heading string
	Body    string
}

// BuiltinKnowledge contains the default knowledge sections seeded into Qdrant static
// on every startup (idempotent via stable IDs).
var BuiltinKnowledge = []KnowledgeSection{
	{
		Heading: "Skill Usage",
		Body: `When the user asks you to perform an action that matches a skill, reply EXACTLY with:
SKILL:<skill-name>:<input>

Do not use native tool use. SKILL:name:input is the only dispatch format.
When user asks to remember or save information → always call SKILL:remember:<text>.`,
	},
	{
		Heading: "Memory",
		Body: `SKILL:remember and SKILL:set_identity are background skills — add them on their own line in your reply and they run silently without replacing your reply.
Use SKILL:remember:<text> whenever the user shares: their name, preferences, facts about themselves, things they like/dislike, where they live/work, contact info, or explicitly asks you to remember something.
Use SKILL:clear_memory to wipe all memory when asked.
Example reply when user says "saya suka kopi hitam":
Noted!

SKILL:remember:user suka kopi hitam`,
	},
	{
		Heading: "Scheduling",
		Body: `To create a recurring scheduled reminder use SKILL:create_schedule:<cron>|||<prompt>
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

// Identity constants
const (
	// IdentityCategory is the Qdrant static category for bot identity fields
	IdentityCategory = "identity"
	// IdentityID is the stable Qdrant point ID for the bot identity record
	IdentityID = "identity-bot"
	// KnowledgeCategory is the Qdrant category for builtin knowledge
	KnowledgeCategory = "knowledge"
	// KnowledgeIDPrefix is the prefix for knowledge section IDs
	KnowledgeIDPrefix = "knowledge-"
)

// IdentityTemplates
const (
	// IdentityNameFormat is the template for storing bot name
	IdentityNameFormat = "name: %s"
	// IdentityLanguageFormat is the template for storing language preference
	IdentityLanguageFormat = "language: %s"
	// IdentityLineSeparator is the separator between identity fields
	IdentityLineSeparator = "\n"
)
