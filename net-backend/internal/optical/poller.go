package optical

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type PollerConfig struct {
	Interval           time.Duration
	RxThresholdDBm     float64
	ODPFaultRatio      float64
	StatusRetention    time.Duration
	DefaultRxParamPath string
	DefaultTxParamPath string
	HuaweiRxParamPath  string
	HuaweiTxParamPath  string
	SweepTimeout       time.Duration
}

func DefaultPollerConfig() PollerConfig {
	return PollerConfig{
		Interval:           10 * time.Minute,
		RxThresholdDBm:     -28.0,
		ODPFaultRatio:      0.5,
		StatusRetention:    7 * 24 * time.Hour,
		DefaultRxParamPath: "InternetGatewayDevice.X_ZTE_COM_GponParm.RxOpticalPower",
		DefaultTxParamPath: "InternetGatewayDevice.X_ZTE_COM_GponParm.TxOpticalPower",
		HuaweiRxParamPath:  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.RxPower",
		HuaweiTxParamPath:  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.TxPower",
		SweepTimeout:       5 * time.Minute,
	}
}

type Poller struct {
	config      PollerConfig
	repo        Repository
	acsClient   *GenieACSClient
	redisClient *redis.Client
	stopChan    chan struct{}
	wg          sync.WaitGroup
}

func NewPoller(cfg PollerConfig, repo Repository, acsClient *GenieACSClient, rc *redis.Client) *Poller {
	return &Poller{
		config:      cfg,
		repo:        repo,
		acsClient:   acsClient,
		redisClient: rc,
		stopChan:    make(chan struct{}),
	}
}

func (p *Poller) Start() {
	p.wg.Add(1)
	go p.run()
	logger.Log.WithFields(logrus.Fields{
		"component": "optical_poller",
		"interval":  p.config.Interval.String(),
		"threshold": p.config.RxThresholdDBm,
	}).Info("Optical poller started")
}

func (p *Poller) Stop() {
	close(p.stopChan)
	p.wg.Wait()
}

func (p *Poller) run() {
	defer p.wg.Done()

	// Run immediately on startup
	p.sweep()

	ticker := time.NewTicker(p.config.Interval)
	defer ticker.Stop()

	// Daily cleanup ticker
	cleanupTicker := time.NewTicker(24 * time.Hour)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case <-ticker.C:
			p.sweep()
		case <-cleanupTicker.C:
			p.cleanup()
		}
	}
}

func (p *Poller) sweep() {
	ctx, cancel := context.WithTimeout(context.Background(), p.config.SweepTimeout)
	defer cancel()

	devices, err := p.repo.FindAllActiveONUs(ctx)
	if err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to fetch active ONUs")
		return
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "optical_poller",
		"count":     len(devices),
	}).Info("Starting optical sweep")

	for _, d := range devices {
		select {
		case <-p.stopChan:
			return
		default:
			p.pollDevice(ctx, d)
		}
	}

	p.checkODPFaults(ctx)
}

func (p *Poller) pollDevice(ctx context.Context, d Device) {
	rxPath, txPath := p.resolveParamPaths(d)
	projection := rxPath + "," + txPath

	params, err := p.acsClient.FetchDeviceParameters(ctx, d.GenieACSID, projection)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component":   "optical_poller",
			"device_id":   d.ID,
			"genieacs_id": d.GenieACSID,
		}).WithError(err).Warn("Failed to fetch device parameters from GenieACS")
		p.insertUnreachableStatus(ctx, d)
		return
	}

	if params == nil {
		logger.Log.WithFields(logrus.Fields{
			"component":   "optical_poller",
			"device_id":   d.ID,
			"genieacs_id": d.GenieACSID,
		}).Warn("Device not found in GenieACS")
		p.insertUnreachableStatus(ctx, d)
		return
	}

	rxPower, err := ExtractFloat(params, rxPath)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "optical_poller",
			"device_id": d.ID,
			"path":      rxPath,
		}).WithError(err).Warn("Failed to extract RX power")
	}

	txPower, err := ExtractFloat(params, txPath)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "optical_poller",
			"device_id": d.ID,
			"path":      txPath,
		}).WithError(err).Warn("Failed to extract TX power")
	}

	// ZTE values are in 0.001 dBm units — divide by 1000
	if d.Vendor == "" || d.Vendor == "zte" {
		if rxPower != nil {
			v := *rxPower / 1000.0
			rxPower = &v
		}
		if txPower != nil {
			v := *txPower / 1000.0
			txPower = &v
		}
	}

	var attenuation *float64
	if rxPower != nil && txPower != nil {
		a := *txPower - *rxPower
		attenuation = &a
	}

	linkStatus := "unknown"
	if rxPower != nil {
		if *rxPower >= -24.0 {
			linkStatus = "up"
		} else if *rxPower >= p.config.RxThresholdDBm {
			linkStatus = "degraded"
		} else {
			linkStatus = "down"
		}
	}

	status := &Status{
		DeviceID:    d.ID,
		RxPower:     rxPower,
		TxPower:     txPower,
		Attenuation: attenuation,
		LinkStatus:  linkStatus,
	}

	if err := p.repo.InsertStatus(ctx, status); err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to insert optical status")
		return
	}

	if rxPower != nil && *rxPower < p.config.RxThresholdDBm {
		alert := &Alert{
			DeviceID:  d.ID,
			AlertType: "rx_below_threshold",
			Severity:  "critical",
			Message:   fmt.Sprintf("Daya RX %.2f dBm di bawah ambang batas %.2f dBm", *rxPower, p.config.RxThresholdDBm),
			RxPower:   rxPower,
		}
		if err := p.repo.UpsertAlert(ctx, alert); err != nil {
			logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to upsert RX alert")
		}
	}

	p.publishStatus(ctx, d, *status)
}

func (p *Poller) insertUnreachableStatus(ctx context.Context, d Device) {
	linkStatus := "down"
	status := &Status{
		DeviceID:   d.ID,
		LinkStatus: linkStatus,
	}
	if err := p.repo.InsertStatus(ctx, status); err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to insert unreachable status")
		return
	}

	alert := &Alert{
		DeviceID:  d.ID,
		AlertType: "device_unreachable",
		Severity:  "warning",
		Message:   fmt.Sprintf("Perangkat %s tidak dapat dijangkau melalui GenieACS", d.Name),
	}
	if err := p.repo.UpsertAlert(ctx, alert); err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to upsert unreachable alert")
	}
}

func (p *Poller) checkODPFaults(ctx context.Context) {
	summaries, err := p.repo.FindODPSummaries(ctx)
	if err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to fetch ODP summaries")
		return
	}

	for _, odp := range summaries {
		if odp.TotalONUs == 0 {
			continue
		}
		downRatio := float64(odp.DownONUs) / float64(odp.TotalONUs)
		if downRatio >= p.config.ODPFaultRatio {
			alert := &Alert{
				DeviceID:  odp.ID,
				AlertType: "odp_fault_suspected",
				Severity:  "critical",
				Message: fmt.Sprintf("ODP %s: %d/%d ONU down (%.0f%%) — kemungkinan gangguan fisik",
					odp.Name, odp.DownONUs, odp.TotalONUs, downRatio*100),
			}
			if err := p.repo.UpsertAlert(ctx, alert); err != nil {
				logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to upsert ODP fault alert")
			}
		}
	}
}

func (p *Poller) publishStatus(ctx context.Context, d Device, s Status) {
	channel := fmt.Sprintf("optical:device:%d:status", d.ID)
	payload := StatusUpdate{
		Type:      "optical_status_update",
		DeviceID:  d.ID,
		Status:    s,
		Timestamp: time.Now().Format(time.RFC3339),
	}
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if err := p.redisClient.Publish(ctx, channel, string(jsonBytes)); err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Warn("Failed to publish status to Redis")
	}
}

func (p *Poller) cleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	olderThan := time.Now().Add(-p.config.StatusRetention)
	n, err := p.repo.DeleteOldStatus(ctx, olderThan)
	if err != nil {
		logger.Log.WithField("component", "optical_poller").WithError(err).Error("Failed to cleanup old optical status")
		return
	}
	if n > 0 {
		logger.Log.WithFields(logrus.Fields{
			"component": "optical_poller",
			"deleted":   n,
		}).Info("Cleaned up old optical status records")
	}
}

func (p *Poller) resolveParamPaths(d Device) (rxPath, txPath string) {
	if d.RxParamPath != "" {
		rxPath = d.RxParamPath
	} else if d.Vendor == "huawei" {
		rxPath = p.config.HuaweiRxParamPath
	} else {
		rxPath = p.config.DefaultRxParamPath
	}

	if d.TxParamPath != "" {
		txPath = d.TxParamPath
	} else if d.Vendor == "huawei" {
		txPath = p.config.HuaweiTxParamPath
	} else {
		txPath = p.config.DefaultTxParamPath
	}
	return
}
