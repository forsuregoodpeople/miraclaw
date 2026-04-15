package packages

import (
	"context"
	"sync"
	"time"

	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

// SyncValidator periodically calls CheckSync for all active routers that have packages.
// It runs as a background goroutine and follows the same stopChan/WaitGroup pattern
// as ResourceObserver in internal/mikrotik/monitoring/observe.go.
type SyncValidator struct {
	service  IPackageService
	routerFn func(ctx context.Context) ([]int, error)
	interval time.Duration
	stopChan chan struct{}
	wg       sync.WaitGroup
}

func NewSyncValidator(
	service IPackageService,
	routerFn func(ctx context.Context) ([]int, error),
	interval time.Duration,
) *SyncValidator {
	return &SyncValidator{
		service:  service,
		routerFn: routerFn,
		interval: interval,
		stopChan: make(chan struct{}),
	}
}

func (v *SyncValidator) Start() {
	v.wg.Add(1)
	go v.run()
	logger.Log.WithFields(logrus.Fields{
		"component": "package_sync_validator",
		"interval":  v.interval.String(),
	}).Info("Package sync validator started")
}

func (v *SyncValidator) run() {
	defer v.wg.Done()
	ticker := time.NewTicker(v.interval)
	defer ticker.Stop()

	for {
		select {
		case <-v.stopChan:
			return
		case <-ticker.C:
			v.checkAll()
		}
	}
}

func (v *SyncValidator) checkAll() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	routerIDs, err := v.routerFn(ctx)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "package_sync_validator",
		}).WithError(err).Error("Failed to list routers for sync")
		return
	}

	for _, routerID := range routerIDs {
		result, err := v.service.CheckSync(ctx, routerID)
		if err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "package_sync_validator",
				"router_id": routerID,
			}).WithError(err).Warn("Sync check failed for router")
			continue
		}
		if result.Mismatch > 0 || result.Missing > 0 {
			logger.Log.WithFields(logrus.Fields{
				"component": "package_sync_validator",
				"router_id": routerID,
				"mismatch":  result.Mismatch,
				"missing":   result.Missing,
				"total":     result.Total,
			}).Warn("Configuration mismatch detected")
		}
	}
}

func (v *SyncValidator) Stop() {
	close(v.stopChan)
	v.wg.Wait()
	logger.Log.WithField("component", "package_sync_validator").Info("Package sync validator stopped")
}
