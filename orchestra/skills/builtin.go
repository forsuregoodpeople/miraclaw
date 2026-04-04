package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/miraclaw/orchestra"
)

// RegisterAll registers all built-in skills into the given System.
func RegisterAll(sys *orchestra.System) {
	sys.Register("datetime", "current date and time in RFC3339", skillDatetime)
	sys.Register("websearch", "search the web: input is the query", skillWebSearch)
	sys.Register("exec", "run a shell command: input is the command", func(ctx context.Context, input string) (string, error) {
		return sys.Exec(ctx, input)
	})
	sys.Register("readfile", "read a file: input is the file path", func(_ context.Context, input string) (string, error) {
		return sys.ReadFile(strings.TrimSpace(input))
	})
	sys.Register("writefile", "write a file: input is path\\ncontent", func(_ context.Context, input string) (string, error) {
		idx := strings.Index(input, "\n")
		if idx < 0 {
			return "", fmt.Errorf("writefile: input must be 'path\\ncontent'")
		}
		path := strings.TrimSpace(input[:idx])
		content := input[idx+1:]
		if err := sys.WriteFile(path, content); err != nil {
			return "", err
		}
		return "ok", nil
	})
}

func skillDatetime(_ context.Context, _ string) (string, error) {
	return time.Now().UTC().Format(time.RFC3339), nil
}

// skillWebSearch queries DuckDuckGo Instant Answer API (no API key required).
func skillWebSearch(ctx context.Context, query string) (string, error) {
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
