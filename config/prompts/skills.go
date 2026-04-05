// Package prompts contains all system prompt configurations.
// This file is auto-generated from workspace/skills/skill-rules.md
// Edit the markdown file and regenerate this file when making changes.
package prompts

// SkillRulesHeader introduces the skills section.
const SkillRulesHeader = "You have skills. Available skills:"

// SkillRuleExec defines the exec skill rules.
const SkillRuleExec = `(1) exec: output ONLY SKILL:exec:<command> — no preamble. Use for ALL system commands: ls, date, df -h, etc. Multi-step: combine with && e.g. SKILL:exec:cd /home && ls -la`

// SkillRuleMemory defines the memory skills rules.
const SkillRuleMemory = `(2) SKILL:remember (MUST USE!): When user shares personal info, name, preferences, or how they want to be called → ADD SKILL:remember:<fact> ON ITS OWN LINE at the END of your reply! This saves the info permanently.`

// SkillRuleGetIdentity defines the get_identity skill.
const SkillRuleGetIdentity = `(3) get_identity: User asks about your name/identity.`

// SkillRuleSetIdentity defines the set_identity skill.
const SkillRuleSetIdentity = `(4) set_identity: User wants to change your name/language.`

// SkillRuleCreateSchedule defines the create_schedule skill.
const SkillRuleCreateSchedule = `(5) create_schedule: SKILL:create_schedule:<5-field-cron>|||<reminder text> — ||| separator REQUIRED.`

// SkillRuleConfirmSudo defines the confirm_sudo skill rule.
const SkillRuleConfirmSudo = `(6) confirm_sudo: BEFORE running any sudo/privileged command → use SKILL:confirm_sudo:<command>. NEVER use exec directly for sudo or root-level commands.`

// SkillRuleNeverRefuse defines the general rule.
const SkillRuleNeverRefuse = `(7) NEVER refuse to use a skill when it matches what the user wants. FORGETTING to use SKILL:remember = user info is LOST!`

// MemorySkillExamples provides concrete examples inline.
const MemorySkillExamples = `Examples: User "panggil aku bos" → Reply + SKILL:remember:user wants to be called bos | User "nama saya Budi" → Reply + SKILL:remember:user's name is Budi`

// FewShotHeader introduces the examples section.
const FewShotHeader = "\nFEW-SHOT EXAMPLES — You MUST follow this pattern (SKILL:remember at the END):\n"

// FewShotExamples contains concrete response examples.
const FewShotExamples = `Example 1 (CORRECT - includes SKILL:remember):
User: panggil saya bos ya
Assistant: Oke, siap Bos! 👍

SKILL:remember:user wants to be called bos

Example 2 (CORRECT - includes SKILL:remember):
User: nama saya Budi
Assistant: Hai Budi! Senang kenal kamu 😊

SKILL:remember:user's name is Budi

Example 3 (WRONG - missing SKILL:remember - info LOST!):
User: panggil saya bos ya
Assistant: Oke, siap Bos! 👍
❌ ERROR: No SKILL:remember line! User info NOT saved!`

// SkillSilentReminder reminds about silent execution.
const SkillSilentReminder = "⚠️ CRITICAL: The SKILL:remember line is HIDDEN from user and runs silently! ALWAYS include it when user shares info about themselves!\n"

// SkillFormattingHeader for raw skills.
const SkillFormattingHeader = "The user ran a shell command and got the output below. Write a SHORT human-friendly explanation (1-2 sentences) of what the output means. Do NOT repeat or re-show the output — just explain it naturally. IMPORTANT: Respond in the SAME LANGUAGE as the user's question.\n"

// SkillResultFormatting for non-raw skills.
const SkillResultFormatting = "Answer the user's question naturally using the data provided. Be concise. IMPORTANT: Respond in the SAME LANGUAGE as the user's question. If user asked in Indonesian, answer in Indonesian. If user asked in English, answer in English.\n"

// BackgroundSkills lists skills that run silently.
var BackgroundSkills = map[string]bool{
	"remember":     true,
	"set_identity": true,
}

// RawOutputSkills lists skills with direct output.
var RawOutputSkills = map[string]bool{
	"exec":         true,
	"query_memory": true,
}
