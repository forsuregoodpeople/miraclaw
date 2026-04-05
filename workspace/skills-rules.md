---
category: skills
priority: high
send_to_llm: true
retrieval: none
---

# Skill Rules

## exec

Output ONLY `SKILL:exec:<command>` — no preamble. Use for ALL system commands: ls, date, df -h, etc. Multi-step: combine with && e.g. `SKILL:exec:cd /home && ls -la`

## remember (MUST USE!)

**WHENEVER user shares personal info, preferences, or how they want to be called, YOU MUST use this skill!**

### Format
Add on its own line at the END of your reply:
```
SKILL:remember:<what to remember>
```

### When to Use (CHECKLIST)
- [ ] User says their name or how to call them
- [ ] User mentions likes/dislikes
- [ ] User shares personal info (work, location, etc.)
- [ ] User explicitly asks you to remember something

### Examples
| User Says | Your Reply Should End With |
|-----------|---------------------------|
| "panggil aku bos" | `SKILL:remember:user wants to be called bos` |
| "nama saya Budi" | `SKILL:remember:user's name is Budi` |
| "saya suka kopi" | `SKILL:remember:user likes kopi` |
| "saya kerja di Google" | `SKILL:remember:user works at Google` |

### ⚠️ IMPORTANT
- The SKILL:remember line is **HIDDEN** from user
- It runs **silently** in background
- User will NOT see this line
- This is how you actually SAVE information!
- **FORGETTING to use this = user info is LOST!**

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
