package dhcp

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

type DHCPObserver struct {
	redisClient       *redis.Client
	routerRepo        mikrotik.RouterRepository
	connectionPool    *mikrotik.ConnectionPool
	leaseRepo         IDHCPLeaseRepository
	activeMonitors    map[int]*dhcpMonitor
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

type dhcpMonitor struct {
	routerID   int
	lastUpdate time.Time
	errorCount int
	stopChan   chan struct{}
}

func NewDHCPObserver(
	redisClient *redis.Client,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	leaseRepo IDHCPLeaseRepository,
	config config.ObserverConfig,
) *DHCPObserver {
	return &DHCPObserver{
		redisClient:       redisClient,
		routerRepo:        routerRepo,
		connectionPool:    connectionPool,
		leaseRepo:         leaseRepo,
		activeMonitors:    make(map[int]*dhcpMonitor),
		interval:          config.Interval,
		sessionTimeout:    config.SessionTimeout,
		redisCacheTTL:     config.RedisCacheTTL,
		errorBackoff:      config.ErrorBackoff,
		maxErrors:         config.MaxErrors,
		schedulerInterval: config.SchedulerInterval,
		stopChan:          make(chan struct{}),
	}
}

func (s *DHCPObserver) Start() error {
	s.wg.Add(1)
	go s.observerScheduler()

	return nil
}

func (s *DHCPObserver) observerScheduler() {
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

func (s *DHCPObserver) updateObservers() {
	ctx, cancel := context.WithTimeout(context.Background(), s.sessionTimeout)
	defer cancel()

	routers, err := s.routerRepo.FindAll(ctx)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_observer",
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
				"component": "dhcp_observer",
				"router_id": routerID,
			}).Debug("Stopped DHCP observation for inactive router")
		}
	}
	s.mu.Unlock()
}

func (s *DHCPObserver) StopRouterObserver(routerID int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if monitor, exists := s.activeMonitors[routerID]; exists {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_observer",
			"router_id": routerID,
		}).Debug("Manually stopped DHCP observation")
	}
}

func (s *DHCPObserver) StartRouterObserver(routerID int) {
	s.mu.RLock()
	_, exists := s.activeMonitors[routerID]
	s.mu.RUnlock()
	if exists {
		return
	}
	s.startRouterObserver(routerID)
}

func (s *DHCPObserver) startRouterObserver(routerID int) {
	monitor := &dhcpMonitor{
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

func (s *DHCPObserver) observeRouter(monitor *dhcpMonitor) {
	jitteredInterval := mikrotik.JitteredInterval(s.interval, 5)

	offset := mikrotik.GenerateMonitorOffset(monitor.routerID, "dhcp", 3, s.interval)

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

			if err := s.updateDHCPLeases(monitor.routerID); err != nil {
				monitor.errorCount++
				logger.Log.WithFields(logrus.Fields{
					"component":   "dhcp_observer",
					"router_id":   monitor.routerID,
					"error_count": monitor.errorCount,
				}).WithError(err).Error("Error updating router DHCP leases")

				if monitor.errorCount >= s.maxErrors {
					logger.Log.WithFields(logrus.Fields{
						"component": "dhcp_observer",
						"router_id": monitor.routerID,
					}).Warn("Router DHCP error threshold reached, entering backoff")
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

func (s *DHCPObserver) updateDHCPLeases(routerID int) error {
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

	reply, err := conn.Run("/ip/dhcp-server/lease/print")
	if err != nil {
		return fmt.Errorf("failed to fetch DHCP leases for router %d: %w", routerID, err)
	}

	// Build isolir IP set from firewall address-list (block-access=yes OR in isolir list)
	isolirIPs := make(map[string]bool)
	if alReply, alErr := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir", "=.proplist=address"); alErr == nil {
		for _, re := range alReply.Re {
			if addr := re.Map["address"]; addr != "" {
				isolirIPs[addr] = true
			}
		}
	}

	var leases []map[string]interface{}
	for _, re := range reply.Re {
		m := re.Map
		activeState := m["status"] == "bound"
		isIsolir := isolirIPs[m["address"]] || m["block-access"] == "true"
		lease := map[string]interface{}{
			"address":        m["address"],
			"mac_address":    m["mac-address"],
			"host_name":      m["host-name"],
			"client_id":      m["client-id"],
			"server":         m["server"],
			"status":         m["status"],
			"expires_after":  m["expires-after"],
			"dynamic":        m["dynamic"] == "true",
			"is_isolir":      isIsolir,
			"active_address": m["active-address"],
			"active_mac":     m["active-mac"],
			"active_server":  m["active-server"],
			"active_state":   activeState,
			"last_seen":      m["last-seen"],
			"comment":        m["comment"],
		}
		leases = append(leases, lease)
	}

	// Upsert leases into DB so pelanggan table auto-populates
	if s.leaseRepo != nil {
		var seenMACs []string
		for i := range leases {
			m := leases[i]
			mac, _ := m["mac_address"].(string)
			if mac == "" {
				continue
			}
			seenMACs = append(seenMACs, mac)
			lease := &DHCPLease{
				RouterID:      routerID,
				Address:       fmt.Sprintf("%v", m["address"]),
				MACAddress:    fmt.Sprintf("%v", m["mac_address"]),
				HostName:      fmt.Sprintf("%v", m["host_name"]),
				ClientID:      fmt.Sprintf("%v", m["client_id"]),
				Server:        fmt.Sprintf("%v", m["server"]),
				Status:        fmt.Sprintf("%v", m["status"]),
				ExpiresAfter:  fmt.Sprintf("%v", m["expires_after"]),
				Dynamic:       m["dynamic"] == true,
				IsIsolir:      m["is_isolir"] == true, // set from isolirIPs or block-access above
				ActiveAddress: fmt.Sprintf("%v", m["active_address"]),
				ActiveMAC:     fmt.Sprintf("%v", m["active_mac"]),
				ActiveServer:  fmt.Sprintf("%v", m["active_server"]),
				ActiveState:   m["active_state"] == true,
				LastSeen:      fmt.Sprintf("%v", m["last_seen"]),
				Comment:       fmt.Sprintf("%v", m["comment"]),
			}
			if err := s.leaseRepo.Upsert(ctx, lease); err != nil {
				logger.Log.WithFields(logrus.Fields{
					"component":   "dhcp_observer",
					"router_id":   routerID,
					"mac_address": lease.MACAddress,
				}).WithError(err).Debug("Failed to upsert DHCP lease")
			} else {
				// Update leases slice with the database ID so WebSocket includes it
				leases[i]["id"] = lease.ID
				leases[i]["router_id"] = routerID
			}
		}

		// Remove dynamic (non-isolir) leases for this router that were not seen
		// in the latest sync — these are stale leftovers from a previous router
		// assignment or devices that have left the network.
		if len(seenMACs) > 0 {
			if err := s.leaseRepo.DeleteStaleByRouter(ctx, routerID, seenMACs); err != nil {
				logger.Log.WithFields(logrus.Fields{
					"component": "dhcp_observer",
					"router_id": routerID,
				}).WithError(err).Warn("Failed to delete stale DHCP leases")
			}
		}
	}

	cacheKey := fmt.Sprintf("mikrotik:dhcp:%d", routerID)
	jsonBytes, err := json.Marshal(leases)
	if err != nil {
		return fmt.Errorf("failed to marshal DHCP leases: %w", err)
	}

	if err := s.redisClient.Set(ctx, cacheKey, string(jsonBytes), s.redisCacheTTL); err != nil {
		return fmt.Errorf("failed to cache DHCP leases: %w", err)
	}

	channelKey := fmt.Sprintf("router:%d:dhcp", routerID)

	logger.Log.WithFields(logrus.Fields{
		"component":    "dhcp_observer",
		"router_id":    routerID,
		"leases_count": len(leases),
		"channel":      channelKey,
	}).Debug("Publishing DHCP leases to channel")

	message := map[string]interface{}{
		"type": "dhcp_update",
		"data": leases,
	}

	messageBytes, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal DHCP message: %w", err)
	}

	if err := s.redisClient.Publish(ctx, channelKey, string(messageBytes)); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_observer",
			"router_id": routerID,
			"channel":   channelKey,
		}).WithError(err).Warn("Failed to publish to channel")
	} else {
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_observer",
			"router_id": routerID,
		}).Debug("DHCP leases published successfully")
	}

	return nil
}

func (s *DHCPObserver) stopAllObservers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for routerID, monitor := range s.activeMonitors {
		close(monitor.stopChan)
		delete(s.activeMonitors, routerID)
	}
}

func (s *DHCPObserver) Stop() {
	close(s.stopChan)
	s.wg.Wait()
}

func (s *DHCPObserver) GetStats() map[string]interface{} {
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
