package static

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

type StaticObserver struct {
	redisClient       *redis.Client
	routerRepo        mikrotik.RouterRepository
	connectionPool    *mikrotik.ConnectionPool
	bindingRepo       IStaticBindingRepository
	activeMonitors    map[int]*staticMonitor
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

type staticMonitor struct {
	routerID   int
	lastUpdate time.Time
	errorCount int
	stopChan   chan struct{}
}

func NewStaticObserver(
	redisClient *redis.Client,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	bindingRepo IStaticBindingRepository,
	cfg config.ObserverConfig,
) *StaticObserver {
	return &StaticObserver{
		redisClient:       redisClient,
		routerRepo:        routerRepo,
		connectionPool:    connectionPool,
		bindingRepo:       bindingRepo,
		activeMonitors:    make(map[int]*staticMonitor),
		interval:          cfg.Interval,
		sessionTimeout:    cfg.SessionTimeout,
		redisCacheTTL:     cfg.RedisCacheTTL,
		errorBackoff:      cfg.ErrorBackoff,
		maxErrors:         cfg.MaxErrors,
		schedulerInterval: cfg.SchedulerInterval,
		stopChan:          make(chan struct{}),
	}
}

func (s *StaticObserver) Start() error {
	s.wg.Add(1)
	go s.observerScheduler()
	return nil
}

func (s *StaticObserver) observerScheduler() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.schedulerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			s.stopAllObservers()
			return
		case <-ticker.C:
			s.updateObservers()
		}
	}
}

func (s *StaticObserver) updateObservers() {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	routers, err := s.routerRepo.FindAll(ctx)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_observer",
		}).WithError(err).Error("Failed to fetch routers")
		return
	}

	routerMap := make(map[int]bool)
	for _, router := range routers {
		if !router.IsActive {
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

	s.mu.Lock()
	for routerID, monitor := range s.activeMonitors {
		if !routerMap[routerID] {
			close(monitor.stopChan)
			delete(s.activeMonitors, routerID)
			logger.Log.WithFields(logrus.Fields{
				"component": "static_observer",
				"router_id": routerID,
			}).Debug("Stopped static observation for inactive router")
		}
	}
	s.mu.Unlock()
}

func (s *StaticObserver) StopRouterObserver(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if monitor, exists := s.activeMonitors[routerID]; exists {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
		logger.Log.WithFields(logrus.Fields{
			"component": "static_observer",
			"router_id": routerID,
		}).Debug("Manually stopped static observation")
	}
}

func (s *StaticObserver) StartRouterObserver(routerID int) {
	s.mu.RLock()
	_, exists := s.activeMonitors[routerID]
	s.mu.RUnlock()
	if exists {
		return
	}
	s.startRouterObserver(routerID)
}

func (s *StaticObserver) startRouterObserver(routerID int) {
	monitor := &staticMonitor{
		routerID: routerID,
		stopChan: make(chan struct{}),
	}

	s.mu.Lock()
	s.activeMonitors[routerID] = monitor
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.observeRouter(monitor)
	}()
}

func (s *StaticObserver) observeRouter(monitor *staticMonitor) {
	jitteredInterval := mikrotik.JitteredInterval(s.interval, 5)

	offset := mikrotik.GenerateMonitorOffset(monitor.routerID, "static", 4, s.interval)
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

			if monitor.errorCount > 0 && monitor.errorCount < s.maxErrors {
				skipProbability := float64(monitor.errorCount) / float64(s.maxErrors) * 0.5
				if rand.Float64() < skipProbability {
					continue
				}
			}

			if err := s.updateStaticBindings(monitor.routerID); err != nil {
				monitor.errorCount++
				logger.Log.WithFields(logrus.Fields{
					"component":   "static_observer",
					"router_id":   monitor.routerID,
					"error_count": monitor.errorCount,
				}).WithError(err).Error("Error updating router static bindings")

				if monitor.errorCount >= s.maxErrors {
					logger.Log.WithFields(logrus.Fields{
						"component": "static_observer",
						"router_id": monitor.routerID,
					}).Warn("Router static error threshold reached, entering backoff")
					inErrorState = true
					errorBackoff.Reset(s.errorBackoff)
				}
			} else {
				monitor.errorCount = 0
				monitor.lastUpdate = time.Now()
			}
		case <-errorBackoff.C:
			inErrorState = false
			monitor.errorCount = 0
		}
	}
}

func (s *StaticObserver) updateStaticBindings(routerID int) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router %d: %w", routerID, err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection for router %d: %w", routerID, err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/hotspot/ip-binding/print")
	if err != nil {
		return fmt.Errorf("failed to fetch IP bindings for router %d: %w", routerID, err)
	}

	// Fetch active hotspot hosts to determine online status
	// UP = IP address dari binding muncul di host table
	hostReply, err := conn.Run("/ip/hotspot/host/print")
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_observer",
			"router_id": routerID,
		}).WithError(err).Warn("Failed to fetch hotspot hosts, is_online will default to false")
	}
	onlineAddresses := make(map[string]bool)
	if hostReply != nil {
		for _, re := range hostReply.Re {
			if addr := re.Map["address"]; addr != "" {
				onlineAddresses[addr] = true
			}
		}
	}

	var bindings []map[string]string
	for _, re := range reply.Re {
		b := make(map[string]string)
		for k, v := range re.Map {
			b[k] = v
		}
		bindings = append(bindings, b)
	}

	// Build StaticBinding structs, upsert to DB, and collect for publishing
	var publishBindings []StaticBinding
	for _, b := range bindings {
		mac := b["mac-address"]
		if mac == "" {
			continue
		}
		// UP jika address binding muncul di host table
		checkAddr := b["address"]
		if checkAddr == "" {
			checkAddr = b["to-address"]
		}
		bindingType := b["type"]
		if bindingType == "" {
			bindingType = "regular"
		}
		sb := StaticBinding{
			RouterID:   routerID,
			Address:    b["address"],
			MACAddress: mac,
			Server:     b["server"],
			Type:       bindingType,
			ToAddress:  b["to-address"],
			Comment:    b["comment"],
			IsDisabled: b["disabled"] == "true",
			IsOnline:   onlineAddresses[checkAddr],
			LastSeen:   b["last-seen"],
		}
		if s.bindingRepo != nil {
			if err := s.bindingRepo.Upsert(ctx, &sb); err != nil {
				logger.Log.WithFields(logrus.Fields{
					"component":   "static_observer",
					"router_id":   routerID,
					"mac_address": mac,
				}).WithError(err).Debug("Failed to upsert static binding")
			}
		}
		publishBindings = append(publishBindings, sb)
	}

	cacheKey := fmt.Sprintf("mikrotik:static:%d", routerID)
	// Cache sebagai StaticBinding array agar konsisten dengan REST API
	cacheBytes, err := json.Marshal(publishBindings)
	if err != nil {
		return fmt.Errorf("failed to marshal static bindings: %w", err)
	}

	if err := s.redisClient.Set(ctx, cacheKey, string(cacheBytes), s.redisCacheTTL); err != nil {
		return fmt.Errorf("failed to cache static bindings: %w", err)
	}

	channelKey := fmt.Sprintf("router:%d:static", routerID)

	logger.Log.WithFields(logrus.Fields{
		"component":      "static_observer",
		"router_id":      routerID,
		"bindings_count": len(publishBindings),
		"channel":        channelKey,
	}).Debug("Publishing static bindings to channel")

	// Publish StaticBinding array (snake_case JSON) bukan raw RouterOS map
	message := map[string]interface{}{
		"type": "static_update",
		"data": publishBindings,
	}

	messageBytes, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal static message: %w", err)
	}

	if err := s.redisClient.Publish(ctx, channelKey, string(messageBytes)); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_observer",
			"router_id": routerID,
			"channel":   channelKey,
		}).WithError(err).Warn("Failed to publish to channel")
	} else {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_observer",
			"router_id": routerID,
		}).Debug("Static bindings published successfully")
	}

	return nil
}

func (s *StaticObserver) stopAllObservers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for routerID, monitor := range s.activeMonitors {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
	}
}

func (s *StaticObserver) Stop() {
	close(s.stopChan)
	s.wg.Wait()
}

func (s *StaticObserver) GetStats() map[string]interface{} {
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
