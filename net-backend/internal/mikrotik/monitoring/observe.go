package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

// ResourceObserver monitors system resources for all active routers.
//
// Architecture (scalable to 1000+ routers):
//   - A single scheduler goroutine enqueues work items every `interval`.
//   - A fixed pool of `workers` goroutines drains the queue concurrently.
//   - No per-router goroutines → memory and goroutine count stay flat
//     regardless of the number of routers.
//   - Per-router error state is tracked in `routerState` to implement
//     adaptive back-off without blocking other routers.
type ResourceObserver struct {
	redisClient    *redis.Client
	routerRepo     mikrotik.RouterRepository
	connectionPool *mikrotik.ConnectionPool
	interval       time.Duration
	sessionTimeout time.Duration
	redisCacheTTL  time.Duration
	maxErrors      int
	errorBackoff   time.Duration
	workers        int

	// job queue: scheduler → worker pool
	jobs chan resourceJob

	// per-router error/backoff state, protected by mu
	mu          sync.RWMutex
	routerState map[int]*routerErrorState

	stopChan chan struct{}
	wg       sync.WaitGroup
}

type resourceJob struct {
	routerID int
	router   *mikrotik.Router
}

type routerErrorState struct {
	errorCount  int
	backoffUntil time.Time
}

func NewResourceObserver(
	redisClient *redis.Client,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	cfg config.ObserverConfig,
) *ResourceObserver {
	workers := cfg.Workers
	if workers <= 0 {
		workers = 20 // default: 20 workers handles 1000 routers comfortably
	}
	return &ResourceObserver{
		redisClient:    redisClient,
		routerRepo:     routerRepo,
		connectionPool: connectionPool,
		interval:       cfg.Interval,
		sessionTimeout: cfg.SessionTimeout,
		redisCacheTTL:  cfg.RedisCacheTTL,
		maxErrors:      cfg.MaxErrors,
		errorBackoff:   cfg.ErrorBackoff,
		workers:        workers,
		jobs:           make(chan resourceJob, workers*4),
		routerState:    make(map[int]*routerErrorState),
		stopChan:       make(chan struct{}),
	}
}

func (s *ResourceObserver) Start() error {
	// Launch worker pool
	for i := 0; i < s.workers; i++ {
		s.wg.Add(1)
		go s.worker()
	}

	// Launch scheduler
	s.wg.Add(1)
	go s.scheduler()

	logger.Log.WithFields(logrus.Fields{
		"component": "resource_observer",
		"workers":   s.workers,
		"interval":  s.interval.String(),
	}).Info("Resource observer started (worker-pool mode)")
	return nil
}

// scheduler fetches active routers every interval and enqueues jobs.
func (s *ResourceObserver) scheduler() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	// Run immediately on start
	s.enqueueAll()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.enqueueAll()
		}
	}
}

func (s *ResourceObserver) enqueueAll() {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	routers, err := s.routerRepo.FindAll(ctx)
	if err != nil {
		logger.Log.WithField("component", "resource_observer").WithError(err).Error("Failed to fetch routers")
		return
	}

	now := time.Now()
	enqueued := 0
	skipped := 0

	for i := range routers {
		r := &routers[i]
		if !r.IsActive {
			continue
		}

		// Check back-off
		s.mu.RLock()
		state := s.routerState[r.ID]
		s.mu.RUnlock()

		if state != nil && now.Before(state.backoffUntil) {
			skipped++
			continue
		}

		job := resourceJob{routerID: r.ID, router: r}

		// Non-blocking send: skip if queue is full (overload protection)
		select {
		case s.jobs <- job:
			enqueued++
		default:
			skipped++
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "resource_observer",
		"enqueued":  enqueued,
		"skipped":   skipped,
		"total":     len(routers),
	}).Debug("Resource jobs enqueued")
}

// worker drains the job queue and processes each router.
func (s *ResourceObserver) worker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.stopChan:
			return
		case job, ok := <-s.jobs:
			if !ok {
				return
			}
			if err := s.processRouter(job); err != nil {
				s.recordError(job.routerID)
				logger.Log.WithFields(logrus.Fields{
					"component": "resource_observer",
					"router_id": job.routerID,
				}).WithError(err).Warn("Failed to update router resources")
			} else {
				s.clearError(job.routerID)
			}
		}
	}
}

func (s *ResourceObserver) processRouter(job resourceJob) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	conn, err := s.connectionPool.GetConnection(job.routerID, job.router)
	if err != nil {
		return fmt.Errorf("get connection: %w", err)
	}

	reply, err := conn.Run("/system/resource/print")
	if err != nil {
		// Discard bad connection so the pool doesn't return a broken socket
		s.connectionPool.DiscardConnection(job.routerID, conn)
		return fmt.Errorf("run command: %w", err)
	}
	s.connectionPool.ReturnConnection(job.routerID, conn)

	if len(reply.Re) == 0 {
		return fmt.Errorf("empty response from router %d", job.routerID)
	}

	resources := mikrotik.TransformResourceData(reply.Re[0].Map)
	jsonBytes, err := json.Marshal(resources)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	cacheKey := fmt.Sprintf("mikrotik:resources:%d", job.routerID)
	if err := s.redisClient.Set(ctx, cacheKey, string(jsonBytes), s.redisCacheTTL); err != nil {
		return fmt.Errorf("redis set: %w", err)
	}

	channelKey := fmt.Sprintf("router:%d:resources", job.routerID)
	if err := s.redisClient.Publish(ctx, channelKey, string(jsonBytes)); err != nil {
		logger.Log.WithField("channel", channelKey).WithError(err).Warn("Failed to publish resources")
	}

	return nil
}

func (s *ResourceObserver) recordError(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	st := s.routerState[routerID]
	if st == nil {
		st = &routerErrorState{}
		s.routerState[routerID] = st
	}
	st.errorCount++
	if st.errorCount >= s.maxErrors {
		st.backoffUntil = time.Now().Add(s.errorBackoff)
		logger.Log.WithFields(logrus.Fields{
			"component": "resource_observer",
			"router_id": routerID,
			"backoff":   s.errorBackoff.String(),
		}).Warn("Router entering error backoff")
	}
}

func (s *ResourceObserver) clearError(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if st, ok := s.routerState[routerID]; ok && st.errorCount > 0 {
		st.errorCount = 0
		st.backoffUntil = time.Time{}
	}
}

func (s *ResourceObserver) Stop() {
	logger.Log.WithField("component", "resource_observer").Info("Stopping resource observer")
	close(s.stopChan)
	s.wg.Wait()
	logger.Log.WithField("component", "resource_observer").Info("Resource observer stopped")
}

// Deprecated stubs kept for backward compatibility with callers that use
// StartRouterObserver / StopRouterObserver from the old per-router API.
func (s *ResourceObserver) StartRouterObserver(_ int) {}
func (s *ResourceObserver) StopRouterObserver(_ int)  {}

func (s *ResourceObserver) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	backoffCount := 0
	for _, st := range s.routerState {
		if time.Now().Before(st.backoffUntil) {
			backoffCount++
		}
	}

	return map[string]interface{}{
		"mode":          "worker_pool",
		"workers":       s.workers,
		"queue_depth":   len(s.jobs),
		"queue_cap":     cap(s.jobs),
		"update_interval": s.interval.String(),
		"routers_in_backoff": backoffCount,
	}
}
