package security

import "regexp"

var (
	shellMetaRe  *regexp.Regexp
	redirectRe   *regexp.Regexp
	subshellRe   *regexp.Regexp
	traversalRe  *regexp.Regexp
	dangerCmdRe  *regexp.Regexp
)

func init() {
	shellMetaRe = regexp.MustCompile(`[;|&` + "`" + `$(){}\[\]]`)
	redirectRe = regexp.MustCompile(`2?>|>>?|<`)
	subshellRe = regexp.MustCompile(`\$\(|\` + "`")
	traversalRe = regexp.MustCompile(`(\.\.[\\/])|(^[\\/])`)
	dangerCmdRe = regexp.MustCompile(
		`(?i)(rm\s+-[rRf]{1,3}\s)` +
			`|(chmod\s+[0-7]{3,4})` +
			`|(chown\s+)` +
			`|(curl\s+.*\|\s*(ba)?sh)` +
			`|(wget\s+.*\|\s*(ba)?sh)` +
			`|(mkfs\.)` +
			`|(dd\s+if=)` +
			`|(sudo\s+)` +
			`|(su\s+-)`,
	)
}

// ValidateCommand checks a command string for dangerous shell patterns.
// Returns a *ViolationError wrapping ErrCommandInjection, or nil.
func ValidateCommand(command string) error {
	type check struct {
		re    *regexp.Regexp
		label string
	}
	checks := []check{
		{shellMetaRe, "shell metacharacter"},
		{redirectRe, "redirect operator"},
		{subshellRe, "subshell"},
		{traversalRe, "path traversal"},
		{dangerCmdRe, "dangerous command"},
	}
	for _, c := range checks {
		if loc := c.re.FindStringIndex(command); loc != nil {
			excerpt := command
			if len(excerpt) > 80 {
				excerpt = excerpt[:80]
			}
			return &ViolationError{
				Cause:   ErrCommandInjection,
				Pattern: c.label + ":" + c.re.String(),
				Input:   excerpt,
			}
		}
	}
	return nil
}
