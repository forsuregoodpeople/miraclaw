// Package prompts contains all system prompt configurations.
// This file is auto-generated from workspace/patterns/auto-extract.md
// Edit the markdown file and regenerate this file when making changes.
package prompts

// PreferencePattern defines a pattern for auto-extraction.
// Prefixes are checked first (anchor match); Contains are checked second (substring match).
// Only the first matching pattern per message is used.
type PreferencePattern struct {
	Prefixes []string
	Contains []string // substring patterns checked after Prefixes
	Label    string
	Category string
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
	// Contains-based Like Patterns (mid-sentence)
	{
		Contains: []string{"saya suka ", "aku suka ", "gue suka ", "i like ", "i love "},
		Label:    "user likes",
		Category: "likes",
	},
	// Contains-based Dislike Patterns (mid-sentence)
	{
		Contains: []string{"saya tidak suka ", "aku tidak suka ", "i don't like ", "i dislike ", "i hate "},
		Label:    "user dislikes",
		Category: "dislikes",
	},
	// Contains-based Location Patterns (mid-sentence)
	{
		Contains: []string{"saya tinggal di ", "aku tinggal di ", "i live in "},
		Label:    "user lives in",
		Category: "location",
	},
	// Has / Owns Patterns
	{
		Contains: []string{"saya punya ", "aku punya ", "i have "},
		Label:    "user has",
		Category: "owns",
	},
	// Origin Patterns
	{
		Contains: []string{"saya orang ", "i am from ", "i'm from "},
		Label:    "user is from",
		Category: "origin",
	},
}

// AutoExtractIDPrefix is the prefix for auto-generated IDs.
const AutoExtractIDPrefix = "auto-"

// AutoExtractCategory is the Qdrant category for auto-extracted preferences.
const AutoExtractCategory = "user"
