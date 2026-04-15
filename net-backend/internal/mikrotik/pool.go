package mikrotik

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/go-routeros/routeros"
	"github.com/net-backend/pkg"
)

// ConnectionPool manages per-router pools of RouterOS connections.
// Each connection is exclusively checked out by one goroutine at a time —
// routeros.Client is NOT thread-safe and must never be shared concurrently.
//
// Scaling notes (up to 1000 routers):
//  - isAlive() health check removed: it issued a /system/resource/print round-trip
//    on EVERY GetConnection, causing massive reconnect churn with many routers.
//    Errors are now handled at the call site (observers retry on error).
//  - MaxPerRouter defaults to 3 (one slot per observer type: resource, DHCP, PPPoE).
//  - IdleTimeout defaults to 10 minutes so connections survive between observer intervals.
//  - cleanupIdleConnections runs every 60 s to avoid accumulating dead sockets.
type ConnectionPool struct {
	routers      map[int]*routerPool
	mu           sync.RWMutex
	idleTimeout  time.Duration
	dialTimeout  time.Duration
	maxRetries   int
	maxPerRouter int
	stopCh       chan struct{}
	wg           sync.WaitGroup
}

// routerPool holds a channel of idle connections for one router.
type routerPool struct {
	router   *Router
	idle     chan *routeros.Client // buffered; capacity = maxPerRouter
	mu       sync.Mutex
	lastUsed time.Time
}

type PoolConfig struct {
	MaxPerRouter int
	IdleTimeout  time.Duration
	DialTimeout  time.Duration
	MaxRetries   int
}

func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxPerRouter: 6,                // 4 observers + 2 buffer for concurrent ops
		IdleTimeout:  10 * time.Minute, // match config.yaml (600s)
		DialTimeout:  15 * time.Second,
		MaxRetries:   5,                // more tolerant for unstable networks
	}
}

func NewConnectionPool(config PoolConfig) *ConnectionPool {
	cp := &ConnectionPool{
		routers:      make(map[int]*routerPool),
		maxPerRouter: config.MaxPerRouter,
		idleTimeout:  config.IdleTimeout,
		dialTimeout:  config.DialTimeout,
		maxRetries:   config.MaxRetries,
		stopCh:       make(chan struct{}),
	}
	cp.wg.Add(1)
	go cp.cleanupIdleConnections()
	return cp
}

// GetConnection checks out an exclusive connection for the caller.
// The caller MUST call ReturnConnection when done.
// NOTE: We do NOT call isAlive() here — health is validated at the call site.
func (cp *ConnectionPool) GetConnection(routerID int, router *Router) (*routeros.Client, error) {
	pool := cp.getOrCreatePool(routerID, router)

	// Try idle pool first (no health check — fast path)
	select {
	case client := <-pool.idle:
		pool.mu.Lock()
		pool.lastUsed = time.Now()
		pool.mu.Unlock()
		return client, nil
	default:
		// No idle connection — create a new one.
	}

	// Retry loop for new connection creation only
	for retry := 0; retry < cp.maxRetries; retry++ {
		client, err := cp.createConnection(router)
		if err != nil {
			log.Printf("[Pool] Failed to create connection to router %d (attempt %d/%d): %v",
				routerID, retry+1, cp.maxRetries, err)
			if retry < cp.maxRetries-1 {
				time.Sleep(time.Duration(retry+1) * time.Second)
			}
			continue
		}
		pool.mu.Lock()
		pool.lastUsed = time.Now()
		pool.mu.Unlock()
		return client, nil
	}

	return nil, pkg.NewError(fmt.Sprintf("failed to establish connection to router %d after %d retries", routerID, cp.maxRetries))
}

// ReturnConnection returns a checked-out connection back to the pool.
// Pass nil or a known-bad connection to discard it.
func (cp *ConnectionPool) ReturnConnection(routerID int, client *routeros.Client) {
	if client == nil {
		return
	}

	cp.mu.RLock()
	pool, exists := cp.routers[routerID]
	cp.mu.RUnlock()

	if !exists {
		client.Close()
		return
	}

	// Put back in idle pool; discard if pool is full
	select {
	case pool.idle <- client:
		pool.mu.Lock()
		pool.lastUsed = time.Now()
		pool.mu.Unlock()
	default:
		client.Close()
	}
}

// DiscardConnection explicitly closes and discards a connection (e.g. after a command error).
// Use this instead of ReturnConnection when you know the connection is broken.
func (cp *ConnectionPool) DiscardConnection(routerID int, client *routeros.Client) {
	if client != nil {
		client.Close()
	}
}

func (cp *ConnectionPool) getOrCreatePool(routerID int, router *Router) *routerPool {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	if pool, exists := cp.routers[routerID]; exists {
		return pool
	}

	pool := &routerPool{
		router:   router,
		idle:     make(chan *routeros.Client, cp.maxPerRouter),
		lastUsed: time.Now(),
	}
	cp.routers[routerID] = pool
	return pool
}

func (cp *ConnectionPool) createConnection(router *Router) (*routeros.Client, error) {
	address := fmt.Sprintf("%s:%d", router.Host, router.Port)
	cl, err := routeros.Dial(address, router.Username, router.Password)
	if err != nil {
		log.Printf("[Pool] Failed to dial router %s@%s: %v", router.Username, address, err)
		return nil, err
	}
	return cl, nil
}

// cleanupIdleConnections drains and removes pools that have been idle for longer
// than idleTimeout. Runs every 60 seconds.
func (cp *ConnectionPool) cleanupIdleConnections() {
	defer cp.wg.Done()
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cp.mu.Lock()
			for routerID, pool := range cp.routers {
				pool.mu.Lock()
				idle := pool.lastUsed
				pool.mu.Unlock()

				if time.Since(idle) > cp.idleTimeout {
				drain:
					for {
						select {
						case client := <-pool.idle:
							client.Close()
						default:
							break drain
						}
					}
					delete(cp.routers, routerID)
				}
			}
			cp.mu.Unlock()
		case <-cp.stopCh:
			return
		}
	}
}

// Stop signals the cleanup goroutine to exit, waits for it, then closes all connections.
func (cp *ConnectionPool) Stop() {
	close(cp.stopCh)
	cp.wg.Wait()
	cp.CloseAll()
}

func (cp *ConnectionPool) CloseAll() {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	for _, pool := range cp.routers {
	drain:
		for {
			select {
			case client := <-pool.idle:
				client.Close()
			default:
				break drain
			}
		}
	}
}

func (cp *ConnectionPool) GetStats() map[string]interface{} {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["total_routers"] = len(cp.routers)
	stats["max_per_router"] = cp.maxPerRouter
	stats["idle_timeout"] = cp.idleTimeout.String()

	routerStats := make(map[int]map[string]interface{})
	for routerID, pool := range cp.routers {
		pool.mu.Lock()
		lastUsed := pool.lastUsed
		idleCount := len(pool.idle)
		pool.mu.Unlock()

		routerStats[routerID] = map[string]interface{}{
			"idle_connections": idleCount,
			"last_used":        lastUsed,
		}
	}

	stats["router_connections"] = routerStats
	return stats
}
