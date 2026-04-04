package security

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

var (
	privateCIDRs []*net.IPNet
	blockedHosts map[string]struct{}
)

func init() {
	cidrStrings := []string{
		"127.0.0.0/8",
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"169.254.0.0/16",
		"::1/128",
		"fc00::/7",
		"100.64.0.0/10", // CGNAT / shared address space
	}
	for _, cidr := range cidrStrings {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("ssrf: invalid CIDR %q: %v", cidr, err))
		}
		privateCIDRs = append(privateCIDRs, ipNet)
	}

	blockedHosts = map[string]struct{}{
		"169.254.169.254":          {}, // AWS/GCP/Azure metadata
		"metadata.google.internal": {},
		"metadata.internal":        {},
		"instance-data":            {}, // DigitalOcean
		"localhost":                {},
	}
}

// ValidateURL parses rawURL, resolves its host, and rejects addresses that
// fall within private CIDRs or the cloud-metadata blocklist.
// Returns a *ViolationError wrapping ErrSSRFBlocked, or nil.
func ValidateURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return &ViolationError{
			Cause:   ErrSSRFBlocked,
			Pattern: "invalid url",
			Input:   rawURL,
		}
	}

	host := u.Hostname()
	if host == "" {
		return nil
	}

	lowerHost := strings.ToLower(host)
	if _, blocked := blockedHosts[lowerHost]; blocked {
		return &ViolationError{
			Cause:   ErrSSRFBlocked,
			Pattern: "blocked host",
			Input:   host,
		}
	}

	// If host is a bare IP, check it directly.
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateIP(ip) {
			return &ViolationError{
				Cause:   ErrSSRFBlocked,
				Pattern: "private IP",
				Input:   host,
			}
		}
		return nil
	}

	// Resolve hostname and check all returned IPs.
	addrs, err := net.LookupHost(host)
	if err != nil {
		// Treat unresolvable hosts as safe (no outbound risk).
		return nil
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip == nil {
			continue
		}
		if isPrivateIP(ip) {
			return &ViolationError{
				Cause:   ErrSSRFBlocked,
				Pattern: "private IP via DNS",
				Input:   addr,
			}
		}
	}
	return nil
}

func isPrivateIP(ip net.IP) bool {
	for _, cidr := range privateCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}
