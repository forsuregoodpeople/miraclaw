---
category: skills
priority: high
send_to_llm: true
retrieval: none
---

# Skill Rules

## exec

Output ONLY `SKILL:exec:<command>` — no preamble. Use for ALL system commands: ls, date, df -h, etc. Multi-step: combine with && e.g. `SKILL:exec:cd /home && ls -la`

## remember

Add on its own line — runs silently. CRITICAL: When user shares name, preferences, likes/dislikes, personal info → YOU MUST include `SKILL:remember:<fact>` on its own line in your reply!

Examples:
- User says 'panggil aku bos' → reply naturally then add line: `SKILL:remember:user wants to be called bos`
- User says 'saya suka kopi' → reply naturally then add line: `SKILL:remember:user likes coffee`

## get_identity

User asks about your name/identity.

## set_identity

User wants to change your name/language. Format: `SKILL:set_identity:<field>:<value>`

## create_schedule

Format: `SKILL:create_schedule:<5-field-cron>|||<reminder text>` — ||| separator REQUIRED.

Cron format: MINUTE HOUR * * WEEKDAY

- WEEKDAY: * = every day, 1-5 = Mon-Fri, 1 = Monday, 0 or 7 = Sunday

Examples:
- Every day 9 AM: `SKILL:create_schedule:0 9 * * *|||Good morning!`
- Weekdays 9 AM: `SKILL:create_schedule:0 9 * * 1-5|||Selamat pagi!`
- Daily 10 PM: `SKILL:create_schedule:0 22 * * *|||Evening check-in`

## clear_memory

Wipe all memory when asked.

## General Rule

NEVER refuse to use a skill when it matches what the user wants.
