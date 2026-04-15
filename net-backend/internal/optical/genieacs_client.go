package optical

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type GenieACSConfig struct {
	BaseURL  string
	Username string
	Password string
	Timeout  time.Duration
}

type GenieACSClient struct {
	mu         sync.RWMutex
	config     GenieACSConfig
	httpClient *http.Client
}

func NewGenieACSClient(cfg GenieACSConfig) *GenieACSClient {
	return &GenieACSClient{
		config: cfg,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

func (c *GenieACSClient) UpdateConfig(cfg GenieACSConfig) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if cfg.Timeout == 0 {
		cfg.Timeout = c.config.Timeout
	}
	c.config = cfg
}

func (c *GenieACSClient) GetConfig() GenieACSConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.config
}

// FetchDeviceParameters queries GenieACS NBI for a device's TR-069 parameters.
// projection is a comma-separated list of parameter paths.
// Returns nil if device not found.
func (c *GenieACSClient) FetchDeviceParameters(ctx context.Context, genieacsID string, projection string) (map[string]interface{}, error) {
	c.mu.RLock()
	cfg := c.config
	c.mu.RUnlock()

	query := fmt.Sprintf(`{"_id":"%s"}`, genieacsID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.BaseURL+"/devices", nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	q := url.Values{}
	q.Set("query", query)
	if projection != "" {
		q.Set("projection", projection)
	}
	req.URL.RawQuery = q.Encode()
	req.Close = true // GenieACS does not send Content-Length; close forces EOF detection

	if cfg.Username != "" {
		req.SetBasicAuth(cfg.Username, cfg.Password)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("genieacs request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("genieacs returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if len(bytes.TrimSpace(body)) == 0 {
		return nil, nil
	}

	var devices []map[string]interface{}
	if err := json.Unmarshal(body, &devices); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if len(devices) == 0 {
		return nil, nil
	}
	return devices[0], nil
}

// ListDevices returns all devices registered in GenieACS.
func (c *GenieACSClient) ListDevices(ctx context.Context, projection string) ([]map[string]interface{}, error) {
	c.mu.RLock()
	cfg := c.config
	c.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.BaseURL+"/devices", nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	if projection != "" {
		q := url.Values{}
		q.Set("projection", projection)
		req.URL.RawQuery = q.Encode()
	}
	req.Close = true // GenieACS does not send Content-Length; close forces EOF detection

	if cfg.Username != "" {
		req.SetBasicAuth(cfg.Username, cfg.Password)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("genieacs list request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("genieacs returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if len(bytes.TrimSpace(body)) == 0 {
		return []map[string]interface{}{}, nil
	}

	var devices []map[string]interface{}
	if err := json.Unmarshal(body, &devices); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	return devices, nil
}

// ExtractFloat extracts a float64 value from a nested GenieACS parameter map.
// path is dot-separated, e.g. "InternetGatewayDevice.X_ZTE_COM_GponParm.RxOpticalPower".
// GenieACS wraps leaf values in {"_value": ..., "_timestamp": ...}.
func ExtractFloat(params map[string]interface{}, path string) (*float64, error) {
	parts := strings.Split(path, ".")
	current := interface{}(params)

	for _, part := range parts {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("path %q: expected object at %q", path, part)
		}
		current = m[part]
	}

	// GenieACS leaf node has "_value" key
	if leaf, ok := current.(map[string]interface{}); ok {
		if v, exists := leaf["_value"]; exists {
			switch val := v.(type) {
			case float64:
				return &val, nil
			case int64:
				f := float64(val)
				return &f, nil
			case json.Number:
				f, err := val.Float64()
				if err != nil {
					return nil, err
				}
				return &f, nil
			}
		}
	}

	return nil, fmt.Errorf("no _value at path %q", path)
}
