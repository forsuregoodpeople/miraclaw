package skills

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/miraclaw/orchestra"
)

// RegisterAll registers all built-in skills into the given System.
func RegisterAll(sys *orchestra.System) {
	sys.Register("datetime", "current date and time in RFC3339", skillDatetime)
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
	sys.Register("sysinfo", "system info: input is ram|cpu|disk|all (default: all)", skillSysinfo)
}

// staticMemory is the minimal interface needed by RegisterMemorySkills.
type staticMemory interface {
	AddStatic(ctx context.Context, id, text, category string) error
}

// RegisterMemorySkills registers memory-aware skills that require access to the memory store.
// Call this after RegisterAll.
func RegisterMemorySkills(sys *orchestra.System, mem staticMemory) {
	sys.Register("remember", "save information to long-term memory: input is the text to remember", func(ctx context.Context, input string) (string, error) {
		input = strings.TrimSpace(input)
		if input == "" {
			return "", fmt.Errorf("remember: input cannot be empty")
		}
		id := fmt.Sprintf("mem-%d", time.Now().UnixNano())
		if err := mem.AddStatic(ctx, id, input, "user"); err != nil {
			return "", fmt.Errorf("remember: %w", err)
		}
		return "Saved to memory: " + input, nil
	})
}

func skillSysinfo(_ context.Context, input string) (string, error) {
	key := strings.TrimSpace(strings.ToLower(input))
	switch key {
	case "ram":
		return ramInfo(), nil
	case "cpu":
		return cpuInfo(), nil
	case "disk":
		return diskInfo(), nil
	default:
		return ramInfo() + "\n" + cpuInfo() + "\n" + diskInfo(), nil
	}
}

func ramInfo() string {
	if runtime.GOOS != "linux" {
		return "RAM: not available on this platform"
	}
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return "RAM: unavailable (read error)"
	}
	defer f.Close()

	vals := map[string]int64{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		if key != "MemTotal" && key != "MemAvailable" {
			continue
		}
		numStr := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(parts[1]), "kB"))
		n, err := strconv.ParseInt(numStr, 10, 64)
		if err == nil {
			vals[key] = n
		}
	}

	total := vals["MemTotal"]
	avail := vals["MemAvailable"]
	used := total - avail
	return fmt.Sprintf("RAM: Total %s | Used %s | Available %s",
		kbToHuman(total), kbToHuman(used), kbToHuman(avail))
}

func cpuInfo() string {
	if runtime.GOOS != "linux" {
		return "CPU: not available on this platform"
	}
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return "CPU: unavailable (read error)"
	}
	defer f.Close()

	var modelName string
	cores := 0
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "processor") {
			cores++
		} else if strings.HasPrefix(line, "model name") && modelName == "" {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				modelName = strings.TrimSpace(parts[1])
			}
		}
	}
	if modelName == "" {
		modelName = runtime.GOARCH
	}
	if cores == 0 {
		cores = 1
	}
	return fmt.Sprintf("CPU: %s (%d cores)", modelName, cores)
}

func diskInfo() string {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(".", &stat); err != nil {
		return "Disk: unavailable"
	}
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	used := total - free
	return fmt.Sprintf("Disk (.): Total %s | Used %s | Free %s",
		bytesToHuman(total), bytesToHuman(used), bytesToHuman(free))
}

func kbToHuman(kb int64) string {
	return bytesToHuman(uint64(kb) * 1024)
}

func bytesToHuman(b uint64) string {
	const gb = 1024 * 1024 * 1024
	const mb = 1024 * 1024
	switch {
	case b >= gb:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(gb))
	case b >= mb:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(mb))
	default:
		return fmt.Sprintf("%d KB", b/1024)
	}
}

func skillDatetime(_ context.Context, _ string) (string, error) {
	return time.Now().UTC().Format(time.RFC3339), nil
}

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
