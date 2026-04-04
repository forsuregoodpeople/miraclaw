package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// WebSearch queries DuckDuckGo Instant Answer API (no API key required).
// Register manually if needed:
//
//	sys.Register("websearch", "search the web: input is the query", func(ctx context.Context, input string) (string, error) {
//	    return skills.WebSearch(ctx, input)
//	})
func WebSearch(ctx context.Context, query string) (string, error) {
	endpoint := "https://api.duckduckgo.com/?q=" + url.QueryEscape(query) + "&format=json&no_html=1&skip_disambig=1"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("websearch: build request: %w", err)
	}
	req.Header.Set("User-Agent", "MiraClaw/1.0")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("websearch: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return "", fmt.Errorf("websearch: read body: %w", err)
	}

	var result struct {
		AbstractText string `json:"AbstractText"`
		Answer       string `json:"Answer"`
		Definition   string `json:"Definition"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("websearch: parse response: %w", err)
	}

	if result.Answer != "" {
		return result.Answer, nil
	}
	if result.AbstractText != "" {
		return result.AbstractText, nil
	}
	if result.Definition != "" {
		return result.Definition, nil
	}
	return "No results found for: " + query, nil
}
