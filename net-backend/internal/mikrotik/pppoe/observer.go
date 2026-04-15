package pppoe

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type PPPOEObserver struct {
	redisClient       *redis.Client
	routerRepo        mikrotik.RouterRepository
	connectionPool    *mikrotik.ConnectionPool
	secretRepo        Repository
	activeMonitors    map[int]*pppoeMonitor
	mu                sync.RWMutex
	interval          time.Duration
	sessionTimeout    time.Duration
	redisCacheTTL     time.Duration
	errorBackoff      time.Duration
	maxErrors         int
	schedulerInterval time.Duration
	stopChan          chan struct{}
	wg                sync.WaitGroup
}

type pppoeMonitor struct {
	routerID   int
	lastUpdate time.Time
	errorCount int
	stopChan   chan struct{}
}

func NewPPPOEObserver(
	redisClient *redis.Client,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	secretRepo Repository,
	config config.ObserverConfig,
) *PPPOEObserver {
	return &PPPOEObserver{
		redisClient:       redisClient,
		routerRepo:        routerRepo,
		connectionPool:    connectionPool,
		secretRepo:        secretRepo,
		activeMonitors:    make(map[int]*pppoeMonitor),
		interval:          config.Interval,
		sessionTimeout:    config.SessionTimeout,
		redisCacheTTL:     config.RedisCacheTTL,
		errorBackoff:      config.ErrorBackoff,
		maxErrors:         config.MaxErrors,
		schedulerInterval: config.SchedulerInterval,
		stopChan:          make(chan struct{}),
	}
}

func (s *PPPOEObserver) Start() error {
	s.wg.Add(1)
	go s.observerScheduler()

	logger.Log.WithFields(logrus.Fields{
		"component":  "pppoe_observer",
		"interval":   s.interval.String(),
		"backoff":    s.errorBackoff.String(),
		"max_errors": s.maxErrors,
	}).Info("PPPoE observer started")
	return nil
}

func (s *PPPOEObserver) observerScheduler() {
	defer s.wg.Done()

	logger.Log.WithField("component", "pppoe_observer_scheduler").Info("Observer scheduler started")

	ticker := time.NewTicker(s.schedulerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			logger.Log.WithField("component", "pppoe_observer_scheduler").Info("Observer scheduler stopping")
			s.stopAllObservers()
			return
		case <-ticker.C:
			s.updateObservers()
		}
	}
}

func (s *PPPOEObserver) updateObservers() {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	routers, err := s.routerRepo.FindAll(ctx)
	if err != nil {
		logger.Log.WithField("component", "pppoe_observer").WithError(err).Error("Failed to fetch routers")
		return
	}

	s.mu.RLock()
	activeCount := len(s.activeMonitors)
	s.mu.RUnlock()

	logger.Log.WithFields(logrus.Fields{
		"component":          "pppoe_observer",
		"total_routers":      len(routers),
		"active_observers":   activeCount,
		"scheduler_interval": s.schedulerInterval.String(),
	}).Debug("Checking routers for observation")

	routerMap := make(map[int]bool)
	skippedCount := 0
	for _, router := range routers {
		if !router.IsActive {
			skippedCount++
			logger.Log.WithFields(logrus.Fields{
				"component":   "pppoe_observer",
				"router_id":   router.ID,
				"router_name": router.Name,
				"reason":      "inactive",
			}).Debug("Skipping inactive router")
			continue
		}

		routerMap[router.ID] = true

		s.mu.RLock()
		_, exists := s.activeMonitors[router.ID]
		s.mu.RUnlock()

		if !exists {
			s.startRouterObserver(router.ID)
		}
	}

	if skippedCount > 0 {
		logger.Log.WithFields(logrus.Fields{
			"component":     "pppoe_observer",
			"skipped_count": skippedCount,
			"reason":        "inactive",
		}).Info("Skipped inactive routers")
	}

	s.mu.Lock()
	for routerID, monitor := range s.activeMonitors {
		if !routerMap[routerID] {
			close(monitor.stopChan)
			delete(s.activeMonitors, routerID)
			logger.Log.WithFields(logrus.Fields{
				"component": "pppoe_observer",
				"router_id": routerID,
				"reason":    "removed_from_db",
			}).Info("Stopped observing router")
		}
	}
	s.mu.Unlock()

	// Sync PPPoE secrets to DB on every scheduler tick so pelanggan table auto-populates
	if s.secretRepo != nil {
		for routerID := range routerMap {
			go s.syncSecretsForRouter(routerID)
		}
	}
}

func (s *PPPOEObserver) syncSecretsForRouter(routerID int) {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ppp/secret/print",
		"=.proplist=.id,name,password,profile,service,local-address,remote-address,comment,disabled")
	if err != nil {
		return
	}

	var secrets []Secret
	for _, re := range reply.Re {
		secrets = append(secrets, Secret{
			RouterID:      routerID,
			MikrotikID:    re.Map[".id"],
			Name:          re.Map["name"],
			Password:      re.Map["password"],
			Profile:       re.Map["profile"],
			Service:       re.Map["service"],
			LocalAddress:  re.Map["local-address"],
			RemoteAddress: re.Map["remote-address"],
			Comment:       re.Map["comment"],
			Disabled:      re.Map["disabled"] == "true",
		})
	}

	if err := s.secretRepo.SyncSecrets(ctx, routerID, secrets); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
		}).WithError(err).Debug("Failed to sync PPPoE secrets to DB")
	}
}

// TriggerSync immediately polls a router's PPPoE sessions and publishes to Redis.
func (s *PPPOEObserver) TriggerSync(routerID int) error {
	return s.updatePPPOESessions(routerID)
}

func (s *PPPOEObserver) StopRouterObserver(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if monitor, exists := s.activeMonitors[routerID]; exists {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
		}).Debug("Manually stopped PPPoE observation")
	}
}

func (s *PPPOEObserver) StartRouterObserver(routerID int) {
	s.mu.RLock()
	_, exists := s.activeMonitors[routerID]
	s.mu.RUnlock()
	if exists {
		return
	}
	s.startRouterObserver(routerID)
	go s.syncSecretsForRouter(routerID)
}

func (s *PPPOEObserver) startRouterObserver(routerID int) {
	monitor := &pppoeMonitor{
		routerID: routerID,
		stopChan: make(chan struct{}),
	}

	s.mu.Lock()
	s.activeMonitors[routerID] = monitor
	s.mu.Unlock()

	logger.Log.WithFields(logrus.Fields{
		"component": "pppoe_observer",
		"router_id": routerID,
		"interval":  s.interval.String(),
	}).Info("Started observing router")

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.observeRouter(monitor)
	}()
}

func (s *PPPOEObserver) observeRouter(monitor *pppoeMonitor) {
	// Hitung interval dengan jitter ±5% untuk konsistensi grafik
	jitteredInterval := mikrotik.JitteredInterval(s.interval, 5)

	// Hitung offset berdasarkan routerID dan monitor type untuk sinkronisasi antar monitor
	// Ada 3 monitor: resource, interface, PPPoE
	offset := mikrotik.GenerateMonitorOffset(monitor.routerID, "pppoe", 3, s.interval)

	// Tunggu offset sebelum mulai monitoring
	if offset > 0 {
		select {
		case <-time.After(offset):
		case <-monitor.stopChan:
			return
		}
	}

	ticker := time.NewTicker(jitteredInterval)
	defer ticker.Stop()

	errorBackoff := time.NewTimer(0)
	if !errorBackoff.Stop() {
		<-errorBackoff.C
	}
	defer errorBackoff.Stop()

	inErrorState := false

	for {
		select {
		case <-monitor.stopChan:
			return
		case <-ticker.C:
			if inErrorState {
				continue
			}

			// Adaptive interval: jika ada error (tapi belum mencapai threshold), skip beberapa tick
			// dengan probability proportional to error count
			if monitor.errorCount > 0 && monitor.errorCount < s.maxErrors {
				// Hitung probability skip = (errorCount/maxErrors) * 50%
				skipProbability := float64(monitor.errorCount) / float64(s.maxErrors) * 0.5
				if rand.Float64() < skipProbability {
					// Skip tick ini
					continue
				}
			}

			if err := s.updatePPPOESessions(monitor.routerID); err != nil {
				monitor.errorCount++
				logger.Log.WithFields(logrus.Fields{
					"component":   "pppoe_observer",
					"router_id":   monitor.routerID,
					"error_count": monitor.errorCount,
					"max_errors":  s.maxErrors,
					"error":       err.Error(),
				}).Error("Error updating router PPPoE sessions")

				if monitor.errorCount >= s.maxErrors {
					logger.Log.WithFields(logrus.Fields{
						"component": "pppoe_observer",
						"router_id": monitor.routerID,
						"backoff":   s.errorBackoff.String(),
					}).Warn("Router error threshold reached, entering backoff")
					inErrorState = true
					errorBackoff.Reset(s.errorBackoff)
				}
			} else {
				if monitor.errorCount > 0 {
					logger.Log.WithFields(logrus.Fields{
						"component":   "pppoe_observer",
						"router_id":   monitor.routerID,
						"error_count": monitor.errorCount,
					}).Info("Router recovered from errors")
				}
				monitor.errorCount = 0
				monitor.lastUpdate = time.Now()
			}
		case <-errorBackoff.C:
			logger.Log.WithFields(logrus.Fields{
				"component": "pppoe_observer",
				"router_id": monitor.routerID,
			}).Info("Router backoff completed, resuming observation")
			inErrorState = false
			monitor.errorCount = 0
		}
	}
}

func (s *PPPOEObserver) updatePPPOESessions(routerID int) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to find router")
		return fmt.Errorf("failed to find router %d: %w", routerID, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "pppoe_observer",
		"router_id":   routerID,
		"router_host": router.Host,
	}).Debug("Fetching router PPPoE sessions")

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to get router connection")
		return fmt.Errorf("failed to get connection for router %d: %w", routerID, err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ppp/active/print",
		"=.proplist=name,address,caller-id,uptime,encoding,limit-bytes-in,limit-bytes-out,bytes-in,bytes-out")
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to fetch PPPoE sessions from router")
		return fmt.Errorf("failed to fetch PPPoE sessions for router %d: %w", routerID, err)
	}

	var sessions []map[string]string
	for _, re := range reply.Re {
		session := make(map[string]string)
		for k, v := range re.Map {
			session[k] = v
		}
		sessions = append(sessions, session)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":     "pppoe_observer",
		"router_id":     routerID,
		"session_count": len(sessions),
	}).Debug("Fetched router PPPoE sessions")

	cacheKey := fmt.Sprintf("mikrotik:pppoe:%d", routerID)
	jsonBytes, err := json.Marshal(sessions)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to marshal PPPoE sessions")
		return fmt.Errorf("failed to marshal PPPoE sessions: %w", err)
	}

	if err := s.redisClient.Set(ctx, cacheKey, string(jsonBytes), s.redisCacheTTL); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to cache PPPoE sessions in Redis")
		return fmt.Errorf("failed to cache PPPoE sessions: %w", err)
	}

	channelKey := fmt.Sprintf("router:%d:pppoe", routerID)
	if err := s.redisClient.Publish(ctx, channelKey, string(jsonBytes)); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "pppoe_observer",
			"router_id": routerID,
			"channel":   channelKey,
			"error":     err.Error(),
		}).Error("Failed to publish to Redis channel")
		return fmt.Errorf("failed to publish to channel %s: %w", channelKey, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":     "pppoe_observer",
		"router_id":     routerID,
		"channel":       channelKey,
		"size":          len(jsonBytes),
		"session_count": len(sessions),
	}).Debug("Published PPPoE sessions to Redis")

	return nil
}

func (s *PPPOEObserver) stopAllObservers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for routerID, monitor := range s.activeMonitors {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
	}
}

func (s *PPPOEObserver) Stop() {
	logger.Log.WithField("component", "pppoe_observer").Info("Stopping PPPoE observer")
	close(s.stopChan)
	s.wg.Wait()
	logger.Log.WithField("component", "pppoe_observer").Info("PPPoE observer stopped")
}

func (s *PPPOEObserver) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["active_observers"] = len(s.activeMonitors)
	stats["update_interval"] = s.interval.String()

	observerStats := make(map[int]map[string]interface{})
	for routerID, monitor := range s.activeMonitors {
		observerStats[routerID] = map[string]interface{}{
			"last_update": monitor.lastUpdate,
			"error_count": monitor.errorCount,
		}
	}

	stats["observers"] = observerStats
	return stats
}
