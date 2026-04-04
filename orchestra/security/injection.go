package security

import "regexp"

var (
	sqlPatterns    []*regexp.Regexp
	promptPatterns []*regexp.Regexp
)

func init() {
	sqlRaw := []string{
		`(?i)UNION\s+SELECT`,
		`(?i)DROP\s+TABLE`,
		`(?i)INSERT\s+INTO`,
		`(?i)DELETE\s+FROM`,
		`(?i)UPDATE\s+\w+\s+SET`,
		`(?i)EXEC\s*\(`,
		`(?i)xp_cmdshell`,
		`--\s`,
		`/\*.*?\*/`,
		`;\s*\w`,
		`(?i)1\s*=\s*1`,
	}
	for _, p := range sqlRaw {
		sqlPatterns = append(sqlPatterns, regexp.MustCompile(p))
	}

	promptRaw := []string{
		`(?i)ignore\s+(all\s+|previous\s+)instructions?`,
		`(?i)ignore\s+(all\s+|previous\s+)prompts?`,
		`(?i)you\s+are\s+now\s+`,
		`(?i)act\s+as\s+(a\s+|an\s+)?\w+`,
		`(?i)jailbreak`,
		`(?i)disregard\s+(your\s+|all\s+)?(previous\s+|prior\s+)?instructions?`,
		`(?i)pretend\s+(you\s+are|to\s+be)`,
		`(?i)from\s+now\s+on\s+you\s+(are|will)`,
		`(?i)(developer|DAN|sudo|god)\s+mode`,
		`(?i)do\s+anything\s+now`,
	}
	for _, p := range promptRaw {
		promptPatterns = append(promptPatterns, regexp.MustCompile(p))
	}
}

// ScanText checks text for SQL and prompt injection patterns.
// Returns a *ViolationError wrapping ErrInjectionDetected, or nil.
func ScanText(text string) error {
	if err := scanPatterns(text, sqlPatterns, "sql"); err != nil {
		return err
	}
	return scanPatterns(text, promptPatterns, "prompt")
}

func scanPatterns(text string, patterns []*regexp.Regexp, label string) error {
	for _, re := range patterns {
		if loc := re.FindStringIndex(text); loc != nil {
			excerpt := text
			if len(excerpt) > 80 {
				excerpt = excerpt[:80]
			}
			return &ViolationError{
				Cause:   ErrInjectionDetected,
				Pattern: label + ":" + re.String(),
				Input:   excerpt,
			}
		}
	}
	return nil
}
