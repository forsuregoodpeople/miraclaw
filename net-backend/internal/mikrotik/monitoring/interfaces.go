package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type InterfaceMonitor struct {
	redisClient       *redis.Client
	routerRepo        mikrotik.RouterRepository
	connectionPool    *mikrotik.ConnectionPool
	activeMonitors    map[int]*routerMonitor
	mu                sync.RWMutex
	interval          time.Duration
	sessionTimeout    time.Duration
	observerTimeout   time.Duration
	redisCacheTTL     time.Duration
	errorBackoff      time.Duration
	maxErrors         int
	schedulerInterval time.Duration
	stopChan          chan struct{}
	wg                sync.WaitGroup
}

type routerMonitor struct {
	routerID   int
	lastUpdate time.Time
	errorCount int
	stopChan   chan struct{}
}

type MonitorConfig struct {
	Interval          time.Duration
	MaxErrors         int
	ErrorBackoff      time.Duration
	SessionTimeout    time.Duration
	ObserverTimeout   time.Duration
	RedisCacheTTL     time.Duration
	SchedulerInterval time.Duration
	BatchSize         int
}

func DefaultMonitorConfig() MonitorConfig {
	return MonitorConfig{
		Interval:          2000 * time.Millisecond,
		MaxErrors:         4,
		ErrorBackoff:      45 * time.Second,
		SessionTimeout:    60 * time.Second,
		ObserverTimeout:   120 * time.Second,
		RedisCacheTTL:     10 * time.Minute,
		SchedulerInterval: 10 * time.Second,
		BatchSize:         40,
	}
}

func NewInterfaceMonitor(
	redisClient *redis.Client,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	config MonitorConfig,
) *InterfaceMonitor {
	return &InterfaceMonitor{
		redisClient:       redisClient,
		routerRepo:        routerRepo,
		connectionPool:    connectionPool,
		activeMonitors:    make(map[int]*routerMonitor),
		interval:          config.Interval,
		sessionTimeout:    config.SessionTimeout,
		observerTimeout:   config.ObserverTimeout,
		redisCacheTTL:     config.RedisCacheTTL,
		errorBackoff:      config.ErrorBackoff,
		maxErrors:         config.MaxErrors,
		schedulerInterval: config.SchedulerInterval,
		stopChan:          make(chan struct{}),
	}
}

func (s *InterfaceMonitor) Start() error {
	s.wg.Add(1)
	go s.monitorScheduler()

	logger.Log.WithFields(logrus.Fields{
		"component":  "interface_monitor",
		"interval":   s.interval.String(),
		"backoff":    s.errorBackoff.String(),
		"max_errors": s.maxErrors,
	}).Info("Interface monitor started")
	return nil
}

func (s *InterfaceMonitor) monitorScheduler() {
	defer s.wg.Done()

	logger.Log.WithField("component", "interface_monitor_scheduler").Info("Monitor scheduler started")

	ticker := time.NewTicker(s.schedulerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			logger.Log.WithField("component", "interface_monitor_scheduler").Info("Monitor scheduler stopping")
			s.stopAllMonitors()
			return
		case <-ticker.C:
			s.updateMonitors()
		}
	}
}

func (s *InterfaceMonitor) updateMonitors() {
	ctx, cancel := context.WithTimeout(context.Background(), s.observerTimeout)
	defer cancel()

	routers, err := s.routerRepo.FindAll(ctx)
	if err != nil {
		logger.Log.WithField("component", "interface_monitor").WithError(err).Error("Failed to fetch routers")
		return
	}

	s.mu.RLock()
	activeCount := len(s.activeMonitors)
	s.mu.RUnlock()

	logger.Log.WithFields(logrus.Fields{
		"component":          "interface_monitor",
		"total_routers":      len(routers),
		"active_monitors":    activeCount,
		"scheduler_interval": s.schedulerInterval.String(),
	}).Debug("Checking routers for monitoring")

	routerMap := make(map[int]bool)
	skippedCount := 0
	for _, router := range routers {
		if !router.IsActive {
			skippedCount++
			logger.Log.WithFields(logrus.Fields{
				"component":   "interface_monitor",
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
			s.startRouterMonitor(router.ID)
		}
	}

	if skippedCount > 0 {
		logger.Log.WithFields(logrus.Fields{
			"component":     "interface_monitor",
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
				"component": "interface_monitor",
				"router_id": routerID,
				"reason":    "removed_from_db",
			}).Info("Stopped monitoring for router")
		}
	}
	s.mu.Unlock()
}

func (s *InterfaceMonitor) StopRouterMonitor(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if monitor, exists := s.activeMonitors[routerID]; exists {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
		log.Printf("Manually stopped monitoring for router %d", routerID)
	}
}

func (s *InterfaceMonitor) StartRouterMonitor(routerID int) {
	s.mu.RLock()
	_, exists := s.activeMonitors[routerID]
	s.mu.RUnlock()
	if exists {
		return
	}
	s.startRouterMonitor(routerID)
}

func (s *InterfaceMonitor) startRouterMonitor(routerID int) {
	monitor := &routerMonitor{
		routerID: routerID,
		stopChan: make(chan struct{}),
	}

	s.mu.Lock()
	s.activeMonitors[routerID] = monitor
	s.mu.Unlock()

	logger.Log.WithFields(logrus.Fields{
		"component": "interface_monitor",
		"router_id": routerID,
		"interval":  s.interval.String(),
	}).Info("Started monitoring router")

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.monitorRouter(monitor)
	}()
}

func (s *InterfaceMonitor) monitorRouter(monitor *routerMonitor) {
	// Hitung interval dengan jitter ±5% untuk konsistensi grafik
	jitteredInterval := mikrotik.JitteredInterval(s.interval, 5)

	// Hitung offset berdasarkan routerID dan monitor type untuk sinkronisasi antar monitor
	// Ada 3 monitor: resource, interface, PPPoE
	offset := mikrotik.GenerateMonitorOffset(monitor.routerID, "interface", 3, s.interval)

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

			if err := s.updateRouterInterfaces(monitor.routerID); err != nil {
				monitor.errorCount++
				logger.Log.WithFields(logrus.Fields{
					"component":   "interface_monitor",
					"router_id":   monitor.routerID,
					"error_count": monitor.errorCount,
					"max_errors":  s.maxErrors,
					"error":       err.Error(),
				}).Error("Error updating router interfaces")

				if monitor.errorCount >= s.maxErrors {
					logger.Log.WithFields(logrus.Fields{
						"component": "interface_monitor",
						"router_id": monitor.routerID,
						"backoff":   s.errorBackoff.String(),
					}).Warn("Router error threshold reached, entering backoff")
					inErrorState = true
					errorBackoff.Reset(s.errorBackoff)
				}
			} else {
				if monitor.errorCount > 0 {
					logger.Log.WithFields(logrus.Fields{
						"component":   "interface_monitor",
						"router_id":   monitor.routerID,
						"error_count": monitor.errorCount,
					}).Info("Router recovered from errors")
				}
				monitor.errorCount = 0
				monitor.lastUpdate = time.Now()
			}
		case <-errorBackoff.C:
			logger.Log.WithFields(logrus.Fields{
				"component": "interface_monitor",
				"router_id": monitor.routerID,
			}).Info("Router backoff completed, resuming monitoring")
			inErrorState = false
			monitor.errorCount = 0
		}
	}
}

func (s *InterfaceMonitor) updateRouterInterfaces(routerID int) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to find router")
		return fmt.Errorf("failed to find router %d: %w", routerID, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "interface_monitor",
		"router_id":   routerID,
		"router_host": router.Host,
	}).Debug("Fetching router interfaces")

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to get router connection")
		return fmt.Errorf("failed to get connection for router %d: %w", routerID, err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/interface/print",
		"=.proplist=name,type,mtu,running,disabled,comment,rx-byte,tx-byte,rx-signal,tx-signal,signal-strength")
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to fetch interfaces from router")
		return fmt.Errorf("failed to fetch interfaces for router %d: %w", routerID, err)
	}

	var interfaces []map[string]string
	for _, re := range reply.Re {
		iface := make(map[string]string)
		for k, v := range re.Map {
			iface[k] = v
		}
		// Skip PPPoE active session virtual interfaces (type == "pppoe-in")
		// Menggunakan case-insensitive comparison untuk menangani variasi huruf kapital
		if strings.EqualFold(iface["type"], "pppoe-in") {
			continue
		}
		interfaces = append(interfaces, iface)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":     "interface_monitor",
		"router_id":     routerID,
		"interfaces":    len(interfaces),
		"running_count": countRunningInterfaces(interfaces),
	}).Debug("Fetched router interfaces")

	cacheKey := fmt.Sprintf("mikrotik:interfaces:%d", routerID)
	jsonBytes, err := json.Marshal(interfaces)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to marshal interfaces")
		return fmt.Errorf("failed to marshal interfaces: %w", err)
	}

	if err := s.redisClient.Set(ctx, cacheKey, string(jsonBytes), s.redisCacheTTL); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"error":     err.Error(),
		}).Error("Failed to cache interfaces in Redis")
		return fmt.Errorf("failed to cache interfaces: %w", err)
	}

	channelKey := fmt.Sprintf("router:%d:interfaces", routerID)
	if err := s.redisClient.Publish(ctx, channelKey, string(jsonBytes)); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "interface_monitor",
			"router_id": routerID,
			"channel":   channelKey,
			"error":     err.Error(),
		}).Error("Failed to publish to Redis channel")
		return fmt.Errorf("failed to publish to channel %s: %w", channelKey, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "interface_monitor",
		"router_id": routerID,
		"channel":   channelKey,
		"size":      len(jsonBytes),
		"count":     len(interfaces),
	}).Debug("Published interfaces to Redis")

	return nil
}

func countRunningInterfaces(interfaces []map[string]string) int {
	count := 0
	for _, iface := range interfaces {
		if iface["running"] == "true" {
			count++
		}
	}
	return count
}

func (s *InterfaceMonitor) stopAllMonitors() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for routerID, monitor := range s.activeMonitors {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
	}
}

func (s *InterfaceMonitor) Stop() {
	logger.Log.WithField("component", "interface_monitor").Info("Stopping interface monitor")
	close(s.stopChan)
	s.wg.Wait()
	logger.Log.WithField("component", "interface_monitor").Info("Interface monitor stopped")
}

func (s *InterfaceMonitor) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["active_monitors"] = len(s.activeMonitors)
	stats["update_interval"] = s.interval.String()

	monitorStats := make(map[int]map[string]interface{})
	for routerID, monitor := range s.activeMonitors {
		monitorStats[routerID] = map[string]interface{}{
			"last_update": monitor.lastUpdate,
			"error_count": monitor.errorCount,
		}
	}

	stats["monitors"] = monitorStats
	return stats
}
