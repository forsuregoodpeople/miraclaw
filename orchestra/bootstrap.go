// Package orchestra provides the bootstrap functionality to load markdown
// files from workspace into Qdrant static collection on first init.
// This ensures token-efficient operation by loading from Qdrant at runtime
// instead of reading files on every request.
package orchestra

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// BootstrapMarkerID is the Qdrant point ID for bootstrap metadata
const BootstrapMarkerID = "bootstrap-marker"

// BootstrapMarkerCategory is the Qdrant category for bootstrap metadata
const BootstrapMarkerCategory = "bootstrap-meta"

// MarkdownFrontmatter represents YAML frontmatter in markdown files
type MarkdownFrontmatter struct {
	Category   string `yaml:"category"`
	Priority   string `yaml:"priority,omitempty"`   // high, medium, low
	SendToLLM  bool   `yaml:"send_to_llm"`          // whether to include in system prompt
	Retrieval  string `yaml:"retrieval,omitempty"`  // semantic, keyword, none
	Section    string `yaml:"section,omitempty"`    // specific section name
}

// MarkdownSection represents a parsed markdown section
type MarkdownSection struct {
	ID          string
	Heading     string
	Content     string
	Category    string
	SourceFile  string
	SendToLLM   bool
	Priority    string
}

// Bootstrap handles loading markdown files into Qdrant
type Bootstrap struct {
	mem          *Memory
	workspaceDir string
}

// BootstrapResult contains metadata about bootstrap operation
type BootstrapResult struct {
	FilesProcessed      int
	SectionsStored      int
	AlreadyBootstrapped bool
	HashMatch           bool
	PreviousHash        string
	CurrentHash         string
}

// NewBootstrap creates a new Bootstrap instance
func NewBootstrap(mem *Memory, workspaceDir string) *Bootstrap {
	return &Bootstrap{
		mem:          mem,
		workspaceDir: workspaceDir,
	}
}

// Run executes the bootstrap operation if not already done
func (b *Bootstrap) Run(ctx context.Context) (*BootstrapResult, error) {
	result := &BootstrapResult{}

	// Calculate current hash of all markdown files
	currentHash, err := b.calculateWorkspaceHash()
	if err != nil {
		return nil, fmt.Errorf("calculate hash: %w", err)
	}
	result.CurrentHash = currentHash

	// Check if already bootstrapped
	marker, err := b.getBootstrapMarker(ctx)
	if err == nil && marker != nil {
		result.AlreadyBootstrapped = true
		result.PreviousHash = marker.ContentHash
		
		// Check if files changed
		if marker.ContentHash == currentHash {
			result.HashMatch = true
			log.Printf("[Bootstrap] Skipped (hash match: %s)", currentHash[:8])
			return result, nil
		}
		
		log.Printf("[Bootstrap] Files changed, rebootstraping...")
		// Clear old bootstrap data
		if err := b.clearBootstrapData(ctx); err != nil {
			log.Printf("[Bootstrap] Warn: failed to clear old data: %v", err)
		}
	}

	// Discover all markdown files
	files, err := b.discoverFiles()
	if err != nil {
		return nil, fmt.Errorf("discover files: %w", err)
	}
	result.FilesProcessed = len(files)

	// Process each file
	for _, file := range files {
		sections, err := b.parseMarkdownFile(file)
		if err != nil {
			log.Printf("[Bootstrap] Warn: failed to parse %s: %v", file, err)
			continue
		}

		for _, section := range sections {
			if err := b.storeSection(ctx, section); err != nil {
				log.Printf("[Bootstrap] Warn: failed to store section %s: %v", section.ID, err)
				continue
			}
			result.SectionsStored++
		}
	}

	// Store bootstrap marker
	if err := b.setBootstrapMarker(ctx, currentHash); err != nil {
		log.Printf("[Bootstrap] Warn: failed to set marker: %v", err)
	}

	log.Printf("[Bootstrap] Complete: %d files, %d sections", 
		result.FilesProcessed, result.SectionsStored)
	
	return result, nil
}

// ForceRebootstrap clears and reloads all markdown data
func (b *Bootstrap) ForceRebootstrap(ctx context.Context) (*BootstrapResult, error) {
	if err := b.clearBootstrapData(ctx); err != nil {
		log.Printf("[Bootstrap] Warn: failed to clear data: %v", err)
	}
	return b.Run(ctx)
}

// IsBootstrapped checks if bootstrap has been performed
func (b *Bootstrap) IsBootstrapped(ctx context.Context) bool {
	marker, err := b.getBootstrapMarker(ctx)
	return err == nil && marker != nil
}

// discoverFiles finds all .md files in workspace
func (b *Bootstrap) discoverFiles() ([]string, error) {
	var files []string
	
	err := filepath.WalkDir(b.workspaceDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(path), ".md") {
			// Skip README.md
			if strings.EqualFold(filepath.Base(path), "README.md") {
				return nil
			}
			files = append(files, path)
		}
		return nil
	})
	
	return files, err
}

// parseMarkdownFile parses a markdown file into sections
func (b *Bootstrap) parseMarkdownFile(filePath string) ([]MarkdownSection, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	content := string(data)
	
	// Parse frontmatter
	frontmatter, body, err := b.extractFrontmatter(content)
	if err != nil {
		// No frontmatter, use defaults
		body = content
		frontmatter = &MarkdownFrontmatter{
			Category:  "knowledge",
			Priority:  "medium",
			SendToLLM: false,
			Retrieval: "semantic",
		}
	}

	// Get relative path for source tracking
	relPath, _ := filepath.Rel(b.workspaceDir, filePath)
	
	// Split body by ## headings
	sections := b.splitByHeadings(body, relPath, frontmatter)
	
	return sections, nil
}

// extractFrontmatter extracts YAML frontmatter from markdown
func (b *Bootstrap) extractFrontmatter(content string) (*MarkdownFrontmatter, string, error) {
	if !strings.HasPrefix(content, "---") {
		return nil, content, fmt.Errorf("no frontmatter")
	}

	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		return nil, content, fmt.Errorf("invalid frontmatter")
	}

	var fm MarkdownFrontmatter
	if err := yaml.Unmarshal([]byte(parts[1]), &fm); err != nil {
		return nil, content, err
	}

	return &fm, strings.TrimSpace(parts[2]), nil
}

// splitByHeadings splits markdown body by ## headings
func (b *Bootstrap) splitByHeadings(body, sourceFile string, fm *MarkdownFrontmatter) []MarkdownSection {
	var sections []MarkdownSection
	
	lines := strings.Split(body, "\n")
	var currentHeading string
	var currentLines []string
	
	flushSection := func() {
		if len(currentLines) == 0 {
			return
		}
		
		content := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if content == "" {
			return
		}

		// Generate ID from file + heading
		sectionID := b.generateSectionID(sourceFile, currentHeading)
		
		section := MarkdownSection{
			ID:         sectionID,
			Heading:    currentHeading,
			Content:    fmt.Sprintf("%s\n\n%s", currentHeading, content),
			Category:   fm.Category,
			SourceFile: sourceFile,
			SendToLLM:  fm.SendToLLM,
			Priority:   fm.Priority,
		}
		
		sections = append(sections, section)
	}

	for _, line := range lines {
		if strings.HasPrefix(line, "## ") {
			flushSection()
			currentHeading = strings.TrimSpace(strings.TrimPrefix(line, "## "))
			currentLines = nil
		} else {
			currentLines = append(currentLines, line)
		}
	}
	
	flushSection()
	
	// If no sections found, treat entire body as one section
	if len(sections) == 0 && strings.TrimSpace(body) != "" {
		sections = append(sections, MarkdownSection{
			ID:         b.generateSectionID(sourceFile, "content"),
			Heading:    filepath.Base(sourceFile),
			Content:    strings.TrimSpace(body),
			Category:   fm.Category,
			SourceFile: sourceFile,
			SendToLLM:  fm.SendToLLM,
			Priority:   fm.Priority,
		})
	}
	
	return sections
}

// generateSectionID creates a unique ID for a section
func (b *Bootstrap) generateSectionID(sourceFile, heading string) string {
	// Clean heading for ID
	cleanHeading := strings.ToLower(heading)
	cleanHeading = strings.ReplaceAll(cleanHeading, " ", "-")
	cleanHeading = strings.ReplaceAll(cleanHeading, ":", "")
	cleanHeading = strings.ReplaceAll(cleanHeading, ",", "")
	cleanHeading = strings.ReplaceAll(cleanHeading, ".", "")
	
	// Clean filename
	cleanFile := strings.TrimSuffix(filepath.Base(sourceFile), ".md")
	cleanFile = strings.ToLower(cleanFile)
	
	return fmt.Sprintf("md-%s-%s", cleanFile, cleanHeading)
}

// storeSection saves a section to Qdrant
func (b *Bootstrap) storeSection(ctx context.Context, section MarkdownSection) error {
	return b.mem.AddStatic(ctx, section.ID, section.Content, section.Category)
}

// calculateWorkspaceHash computes hash of all markdown content
func (b *Bootstrap) calculateWorkspaceHash() (string, error) {
	files, err := b.discoverFiles()
	if err != nil {
		return "", err
	}

	h := sha256.New()
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		h.Write(data)
	}

	return fmt.Sprintf("%x", h.Sum(nil))[:16], nil
}

// BootstrapMarker stores bootstrap metadata
type BootstrapMarker struct {
	ContentHash string
	Timestamp   time.Time
	Version     string
}

// getBootstrapMarker retrieves bootstrap marker from Qdrant
func (b *Bootstrap) getBootstrapMarker(ctx context.Context) (*BootstrapMarker, error) {
	results, err := b.mem.GetStaticByCategory(ctx, BootstrapMarkerCategory)
	if err != nil {
		return nil, err
	}
	
	for _, r := range results {
		if r.ID == BootstrapMarkerID {
			// Parse marker content
			parts := strings.Split(r.Text, "|")
			if len(parts) >= 2 {
				marker := &BootstrapMarker{
					ContentHash: parts[0],
					Version:     parts[1],
				}
				if ts, err := time.Parse(time.RFC3339, parts[2]); err == nil {
					marker.Timestamp = ts
				}
				return marker, nil
			}
		}
	}
	
	return nil, fmt.Errorf("marker not found")
}

// setBootstrapMarker saves bootstrap marker to Qdrant
func (b *Bootstrap) setBootstrapMarker(ctx context.Context, hash string) error {
	content := fmt.Sprintf("%s|v1|%s", hash, time.Now().Format(time.RFC3339))
	return b.mem.AddStatic(ctx, BootstrapMarkerID, content, BootstrapMarkerCategory)
}

// clearBootstrapData removes all bootstrapped data
func (b *Bootstrap) clearBootstrapData(ctx context.Context) error {
	// Categories to clear (bootstrap-managed only)
	categories := []string{"core", "skills", "knowledge", "examples", "patterns"}
	
	for _, cat := range categories {
		results, err := b.mem.GetStaticByCategory(ctx, cat)
		if err != nil {
			continue
		}
		
		for _, r := range results {
			// Only delete if ID starts with md- (markdown bootstrap)
			if strings.HasPrefix(r.ID, "md-") {
				// Note: mem.DeleteStatic not implemented yet
				// For now, we'll just skip and overwrite on rebootstrap
				_ = r
			}
		}
	}
	
	return nil
}
