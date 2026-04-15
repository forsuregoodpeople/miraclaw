package api

import (
	"context"
	"time"

	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type CleanupService struct {
	repo        mikrotik.RouterRepository
	pingService *PingService
	config      config.CleanupConfig
	stopChan    chan struct{}
}

func NewCleanupService(repo mikrotik.RouterRepository, cfg config.CleanupConfig) *CleanupService {
	return &CleanupService{
		repo:        repo,
		pingService: NewPingService(),
		config:      cfg,
		stopChan:    make(chan struct{}),
	}
}

func (c *CleanupService) StartBackgroundCleanup() {
	go c.checkAndFixStuckRouters()
	ticker := time.NewTicker(c.config.CheckInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.checkAndFixStuckRouters()
			case <-c.stopChan:
				return
			}
		}
	}()
}

func (c *CleanupService) Stop() {
	close(c.stopChan)
}

func (c *CleanupService) checkAndFixStuckRouters() {
	ctx, cancel := context.WithTimeout(context.Background(), c.config.CheckTimeout)
	defer cancel()

	routers, err := c.repo.FindAll(ctx)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "cleanup",
			"operation": "check_routers",
		}).WithError(err).Error("Failed to get routers")
		return
	}

	stuckCount := 0
	for _, router := range routers {
		if router.Status == "Pinging" && router.IsActive {
			if router.UpdatedAt != nil && time.Since(*router.UpdatedAt) > c.config.StuckThreshold {
				logger.Log.WithFields(logrus.Fields{
					"component":       "cleanup",
					"operation":       "stuck_router",
					"router_id":       router.ID,
					"router_name":     router.Name,
					"stuck_threshold": c.config.StuckThreshold,
					"stuck_duration":  time.Since(*router.UpdatedAt),
				}).Info("Found stuck router, fixing...")
				go c.pingAndUpdateRouterWithRetry(router.ID, router.Host, router.Port, router.Name)
				stuckCount++
			}
		}
	}

	if stuckCount > 0 {
		logger.Log.WithFields(logrus.Fields{
			"component":   "cleanup",
			"operation":   "stuck_router",
			"stuck_count": stuckCount,
		}).Info("Started fixing stuck routers")
	}
}

func (c *CleanupService) pingAndUpdateRouterWithRetry(routerID int, host string, port int, name string) {
	checkCtx, checkCancel := context.WithTimeout(context.Background(), c.config.GetRouterTimeout)
	defer checkCancel()

	router, err := c.repo.FindById(checkCtx, routerID)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "cleanup",
			"operation": "ping",
			"router_id": routerID,
		}).WithError(err).Error("Failed to get router")
		return
	}

	if !router.IsActive {
		logger.Log.WithFields(logrus.Fields{
			"component":   "cleanup",
			"operation":   "ping",
			"router_id":   routerID,
			"router_name": name,
		}).Warn("Router is not active, skipping ping retry")
		return
	}

	for attempt := 1; attempt <= c.config.MaxRetries; attempt++ {
		checkCtx2, checkCancel2 := context.WithTimeout(context.Background(), c.config.GetRouterTimeout)
		router, err = c.repo.FindById(checkCtx2, routerID)
		checkCancel2()

		if err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "cleanup",
				"operation": "ping",
				"router_id": routerID,
				"attempt":   attempt,
			}).WithError(err).Error("Failed to get router")
			break
		}

		if !router.IsActive {
			logger.Log.WithFields(logrus.Fields{
				"component":   "cleanup",
				"operation":   "ping",
				"router_id":   routerID,
				"router_name": name,
				"attempt":     attempt,
			}).Warn("Router is no longer active on attempt, stopping")
			return
		}

		logger.Log.WithFields(logrus.Fields{
			"component":   "cleanup",
			"operation":   "ping",
			"router_id":   routerID,
			"router_name": name,
			"attempt":     attempt,
			"max_retries": c.config.MaxRetries,
		}).Debug("Ping attempt")

		pingCtx, pingCancel := context.WithTimeout(context.Background(), c.config.PingTimeout)

		result, err := c.pingService.PingRouterWithFallback(pingCtx, host, port)
		pingCancel()

		if err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component":   "cleanup",
				"operation":   "ping",
				"status":      "error",
				"router_id":   routerID,
				"router_name": name,
				"attempt":     attempt,
			}).WithError(err).Error("Ping failed")
			if attempt < c.config.MaxRetries {
				time.Sleep(c.config.RetryDelay)
				continue
			}
			c.updateRouterStatus(routerID, "down", name)
			return
		}

		status := "down"
		if result.Success {
			status = "up"
			logger.Log.WithFields(logrus.Fields{
				"component":   "cleanup",
				"operation":   "ping",
				"status":      "success",
				"router_id":   routerID,
				"router_name": name,
				"attempt":     attempt,
				"latency_ms":  result.Latency,
			}).Info("Ping successful")
		} else {
			logger.Log.WithFields(logrus.Fields{
				"component":   "cleanup",
				"operation":   "ping",
				"status":      "failed",
				"router_id":   routerID,
				"router_name": name,
				"attempt":     attempt,
				"latency_ms":  result.Latency,
			}).Warn("Ping unsuccessful")
			if attempt < c.config.MaxRetries {
				time.Sleep(c.config.RetryDelay)
				continue
			}
		}

		c.updateRouterStatus(routerID, status, name)
		return
	}
}

func (c *CleanupService) updateRouterStatus(routerID int, status string, name string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.config.UpdateStatusTimeout)
	defer cancel()

	if err := c.repo.UpdateStatus(ctx, routerID, status); err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component":   "cleanup",
			"operation":   "update_status",
			"status":      "error",
			"router_id":   routerID,
			"router_name": name,
			"new_status":  status,
		}).WithError(err).Error("Failed to update router status")
	} else {
		logger.Log.WithFields(logrus.Fields{
			"component":   "cleanup",
			"operation":   "update_status",
			"status":      "success",
			"router_id":   routerID,
			"router_name": name,
			"new_status":  status,
		}).Info("Router status updated successfully")
	}
}
