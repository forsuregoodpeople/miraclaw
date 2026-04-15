package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type RateLimiter struct {
	requests map[string]*clientInfo
	mu       sync.RWMutex
	rate     int
	window   time.Duration
	cleanup  time.Duration
}

type clientInfo struct {
	lastRequest time.Time
	count       int
}

var globalLimiter *RateLimiter

func NewGlobalLimiter(rate int, window time.Duration, cleanup time.Duration) *RateLimiter {
	return &RateLimiter{
		requests: make(map[string]*clientInfo),
		rate:     rate,
		window:   window,
		cleanup:  cleanup,
	}
}

func InitRateLimiter(rate int, window time.Duration, cleanup time.Duration) {
	globalLimiter = NewGlobalLimiter(rate, window, cleanup)
	go globalLimiter.cleanupExpiredClients()
}

func (rl *RateLimiter) cleanupExpiredClients() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()

		for ip, info := range rl.requests {
			if now.Sub(info.lastRequest) > rl.window {
				delete(rl.requests, ip)
				logger.Log.WithField("ip", ip).Debug("Rate limiter: expired client")
			}
		}

		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ip := c.IP()

		rl.mu.RLock()
		client, exists := rl.requests[ip]
		rl.mu.RUnlock()

		if !exists {
			rl.mu.Lock()
			client = &clientInfo{lastRequest: time.Now(), count: 1}
			rl.requests[ip] = client
			rl.mu.Unlock()
			return c.Next()
		}

		rl.mu.Lock()
		timeSinceLastRequest := time.Since(client.lastRequest)
		if timeSinceLastRequest > rl.window {
			client.count = 1
			client.lastRequest = time.Now()
			rl.requests[ip] = client
			rl.mu.Unlock()
			return c.Next()
		}

		client.count++
		rl.mu.Unlock()

		if client.count > rl.rate {
			logger.Log.WithFields(logrus.Fields{
				"ip":    ip,
				"count": client.count,
				"rate":  rl.rate,
			}).Warn("Rate limit exceeded")

			return c.Status(fiber.StatusTooManyRequests).JSON(pkg.Response{
				StatusCode: fiber.StatusTooManyRequests,
				Message:    "Too many requests. Please try again later.",
			})
		}

		return c.Next()
	}
}

func RateLimit(rate int, window time.Duration) fiber.Handler {
	if globalLimiter == nil {
		InitRateLimiter(rate, window, 5*time.Minute)
	}
	return globalLimiter.Middleware()
}
