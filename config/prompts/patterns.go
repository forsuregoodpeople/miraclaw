// Package prompts contains all system prompt configurations.
// This file is auto-generated from workspace/patterns/auto-extract.md
// Edit the markdown file and regenerate this file when making changes.
package prompts

// PreferencePattern defines a pattern for auto-extraction.
type PreferencePattern struct {
	Prefixes   []string
	Label      string
	Category   string
}

// AutoExtractPatterns contains all patterns for automatic preference extraction.
// These patterns are matched in order, and only the first match is used per message.
var AutoExtractPatterns = []PreferencePattern{
	// Name Patterns
	{
		Prefixes:   []string{"panggil saya ", "panggil aku ", "call me ", "panggil gue "},
		Label:      "user wants to be called",
		Category:   "name",
	},
	// Name Declaration Patterns
	{
		Prefixes:   []string{"nama saya ", "nama ku ", "namaku ", "my name is ", "saya "},
		Label:      "user's name is",
		Category:   "name_declaration",
	},
	// Like Patterns
	{
		Prefixes:   []string{"saya suka ", "aku suka ", "gue suka ", "i like ", "i love "},
		Label:      "user likes",
		Category:   "likes",
	},
	// Dislike Patterns
	{
		Prefixes:   []string{"saya tidak suka ", "aku tidak suka ", "i don't like ", "i dislike "},
		Label:      "user dislikes",
		Category:   "dislikes",
	},
	// Enjoyment Patterns
	{
		Prefixes:   []string{"saya senang ", "aku senang "},
		Label:      "user enjoys",
		Category:   "enjoys",
	},
	// Disgust Patterns
	{
		Prefixes:   []string{"saya benci ", "aku benci "},
		Label:      "user hates",
		Category:   "hates",
	},
	// Location Patterns
	{
		Prefixes:   []string{"saya tinggal di ", "aku tinggal di ", "saya di ", "i live in "},
		Label:      "user lives in",
		Category:   "location",
	},
	// Work Patterns
	{
		Prefixes:   []string{"saya kerja di ", "aku kerja di ", "saya bekerja di ", "i work at "},
		Label:      "user works at",
		Category:   "work",
	},
}

// AutoExtractIDPrefix is the prefix for auto-generated IDs.
const AutoExtractIDPrefix = "auto-"

// AutoExtractCategory is the Qdrant category for auto-extracted preferences.
const AutoExtractCategory = "user"
