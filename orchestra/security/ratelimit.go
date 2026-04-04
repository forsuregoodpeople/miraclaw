package security

import (
	"sync"
	"time"
)

// RateLimiterConfig holds token bucket parameters.
type RateLimiterConfig struct {
	Requests int           // max tokens per window
	Window   time.Duration // refill period
}

// RateLimiter is a per-channel token bucket limiter, safe for concurrent use.
type RateLimiter struct {
	cfg     RateLimiterConfig
	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	tokens    int
	lastReset time.Time
}

// NewRateLimiter creates a RateLimiter with the given config.
func NewRateLimiter(cfg RateLimiterConfig) *RateLimiter {
	return &RateLimiter{
		cfg:     cfg,
		buckets: make(map[string]*bucket),
	}
}

// Allow returns nil if the channel is within its limit, ErrRateLimited otherwise.
func (r *RateLimiter) Allow(channelID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	b, ok := r.buckets[channelID]
	if !ok {
		b = &bucket{tokens: r.cfg.Requests, lastReset: now}
		r.buckets[channelID] = b
	}

	if now.Sub(b.lastReset) >= r.cfg.Window {
		b.tokens = r.cfg.Requests
		b.lastReset = now
	}

	if b.tokens <= 0 {
		return &ViolationError{
			Cause:   ErrRateLimited,
			Pattern: "token bucket exhausted",
			Input:   channelID,
		}
	}
	b.tokens--
	return nil
}
