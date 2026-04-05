# MiraClaw Workspace

Workspace ini berisi konfigurasi terpisah dari kode utama untuk memudahkan
maintenance dan kustomisasi behavior agent tanpa harus edit file `.go` secara langsung.

---

## Struktur Folder

```
workspace/                      # Markdown configs (human-editable)
├── README.md
├── prompts/                    # System prompts dan persona
│   ├── persona.md
│   └── few-shot-examples.md
├── skills/                     # Skill configurations
│   └── skill-rules.md
├── patterns/                   # Pattern matching rules
│   └── auto-extract.md
└── knowledge/                  # Builtin knowledge base
    └── builtin-knowledge.md

config/prompts/                 # Go source files
├── persona.go
├── skills.go
├── patterns.go
└── knowledge.go                # NEW: Builtin knowledge & identity
```

---

## Workflow Editing

### Cara 1: Edit Markdown → Regenerate Go Files (Recommended)

1. **Edit file markdown** di folder `workspace/`
2. **Generate ulang** file Go di `config/prompts/`
3. **Build & test**

```bash
# Edit workspace/prompts/persona.md
# ... kemudian generate Go file:
# (Manual: copy isi ke config/prompts/persona.go)

# Build
cd /home/nichola/Local/Coding/Go/MiraClaw
go build ./...

# Test
go test ./...
```

### Cara 2: Langsung Edit Go Files (Quick Fix)

Untuk perubahan cepat, edit langsung file di `config/prompts/`:

```bash
# Edit config/prompts/persona.go
go build ./...
```

---

## Mapping: Markdown → Go

| Markdown File | Go File | Konstanta Utama |
|--------------|---------|-----------------|
| `prompts/persona.md` | `config/prompts/persona.go` | `CorePersona`, `BubbleFormat` |
| `skills/skill-rules.md` | `config/prompts/skills.go` | `SkillRuleExec`, `SkillRuleMemory` |
| `patterns/auto-extract.md` | `config/prompts/patterns.go` | `AutoExtractPatterns` |
| `prompts/few-shot-examples.md` | `config/prompts/skills.go` | `FewShotExamples` |
| `knowledge/builtin-knowledge.md` | `config/prompts/knowledge.go` | `BuiltinKnowledge`, `IdentityCategory` |

---

## Cara Menambah Pattern Baru

### Contoh: Tambah Pattern "Hobi"

**Step 1: Edit `workspace/patterns/auto-extract.md`**

```yaml
### 9. Hobby Patterns

```yaml
category: hobby
label_prefix: "user's hobby is"
patterns:
  - "hobi saya "
  - "hobi aku "
  - "my hobby is "
```
```

**Step 2: Update `config/prompts/patterns.go`**

```go
// Tambahkan ke AutoExtractPatterns
{
    Prefixes:   []string{"hobi saya ", "hobi aku ", "my hobby is "},
    Label:      "user's hobby is",
    Category:   "hobby",
},
```

**Step 3: Build & Test**

```bash
go build ./...
go test ./...
```

---

## Cara Mengubah Persona

**Edit `config/prompts/persona.go`:**

```go
const CorePersona = `You are a formal, professional assistant...
- Always be polite and use formal language
...`
```

---

## Cara Menambah Skill Rule

**Edit `config/prompts/skills.go`:**

```go
const SkillRuleNewSkill = `(7) new_skill: description here.`
```

Kemudian gunakan di `agent.go`:

```go
sysContent.WriteString(prompts.SkillRuleNewSkill)
```

---

## Cara Menambah Builtin Knowledge

**Edit `config/prompts/knowledge.go`:**

```go
var BuiltinKnowledge = []KnowledgeSection{
    // ... existing sections ...
    {
        Heading: "New Section",
        Body: `Content here...`,
    },
}
```

Knowledge ini akan di-seed ke Qdrant setiap startup (idempotent).

---

## Konstanta Penting

### Background Skills

```go
var BackgroundSkills = map[string]bool{
    "remember":     true,
    "set_identity": true,
}
```

### Raw Output Skills

```go
var RawOutputSkills = map[string]bool{
    "exec":         true,
    "query_memory": true,
}
```

### Auto-Extract Config

```go
const AutoExtractIDPrefix = "auto-"
const AutoExtractCategory = "user"
```

### Knowledge & Identity Config

```go
const IdentityCategory = "identity"      # Qdrant category untuk identity
const IdentityID = "identity-bot"         # Stable Qdrant point ID
const KnowledgeCategory = "knowledge"     # Qdrant category untuk builtin knowledge
const KnowledgeIDPrefix = "knowledge-"    # Prefix untuk knowledge section IDs

const IdentityNameFormat = "name: %s"
const IdentityLanguageFormat = "language: %s"
```

---

## Troubleshooting

### Build Error: "undefined: prompts.Xxx"

Pastikan:
1. Package `config/prompts` di-import di `agent.go`
2. Konstanta sudah didefinisikan di file `.go`

### Perubahan Tidak Ber_efek

1. Pastikan file `.go` sudah di-save
2. Rebuild: `go build ./...`
3. Restart bot

---

## Future Improvements

- [ ] Auto-generate Go files dari Markdown
- [ ] Hot-reload tanpa restart
- [ ] Validasi schema untuk markdown files
