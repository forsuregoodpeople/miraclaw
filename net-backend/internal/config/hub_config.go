package config

import "time"

type HubConfig struct {
	BufferSize   int
	NumWorkers   int
	PingInterval time.Duration
	PongWait     time.Duration
	WriteWait    time.Duration
}

type ObserverConfig struct {
	Interval          time.Duration
	MaxErrors         int
	ErrorBackoff      time.Duration
	SessionTimeout    time.Duration
	ObserverTimeout   time.Duration
	RedisCacheTTL     time.Duration
	SchedulerInterval time.Duration
	BatchSize         int
	Workers           int
}

type CleanupConfig struct {
	CheckInterval       time.Duration
	CheckTimeout        time.Duration
	StuckThreshold      time.Duration
	GetRouterTimeout    time.Duration
	MaxRetries          int
	RetryDelay          time.Duration
	PingTimeout         time.Duration
	UpdateStatusTimeout time.Duration
}

func DefaultHubConfig() HubConfig {
	return HubConfig{
		BufferSize:   10000,
		NumWorkers:   10,
		PingInterval: 30 * time.Second,
		PongWait:     60 * time.Second,
		WriteWait:    10 * time.Second,
	}
}

func DefaultObserverConfig() ObserverConfig {
	return ObserverConfig{
		Interval:          2000 * time.Millisecond,
		MaxErrors:         4,
		ErrorBackoff:      45 * time.Second,
		SessionTimeout:    60 * time.Second,
		ObserverTimeout:   120 * time.Second,
		RedisCacheTTL:     10 * time.Minute,
		SchedulerInterval: 10 * time.Second,
		BatchSize:         40,
		Workers:           20,
	}
}

func DefaultCleanupConfig() CleanupConfig {
	return CleanupConfig{
		CheckInterval:       5 * time.Minute,
		CheckTimeout:        30 * time.Second,
		StuckThreshold:      2 * time.Minute,
		GetRouterTimeout:    5 * time.Second,
		MaxRetries:          3,
		RetryDelay:          2 * time.Second,
		PingTimeout:         10 * time.Second,
		UpdateStatusTimeout: 10 * time.Second,
	}
}
