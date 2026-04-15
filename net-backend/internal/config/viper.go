package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

type ServerConfig struct {
	Host                string `mapstructure:"host"`
	Port                int    `mapstructure:"port"`
	IdleTimeoutSeconds  int    `mapstructure:"idle_timeout_seconds"`
	ReadTimeoutSeconds  int    `mapstructure:"read_timeout_seconds"`
	WriteTimeoutSeconds int    `mapstructure:"write_timeout_seconds"`
}

type LoggingConfig struct {
	Level       string `mapstructure:"level"`
	Format      string `mapstructure:"format"`
	Colors      bool   `mapstructure:"colors"`
	EnableInfo  bool   `mapstructure:"enable_info"`
	EnableDebug bool   `mapstructure:"enable_debug"`
	EnableError bool   `mapstructure:"enable_error"`
	Websocket   struct {
		EnableRedisLog     bool `mapstructure:"enable_redis_log"`
		EnableBroadcastLog bool `mapstructure:"enable_broadcast_log"`
	} `mapstructure:"websocket"`
}

type JWTConfig struct {
	Secret          string `mapstructure:"secret"`
	ExpirationHours int    `mapstructure:"expiration_hours"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Database string `mapstructure:"name"`
	Username string `mapstructure:"user"`
	Password string `mapstructure:"password"`
}

type RedisConfig struct {
	Host                 string `mapstructure:"host"`
	Port                 int    `mapstructure:"port"`
	Password             string `mapstructure:"password"`
	DB                   int    `mapstructure:"db"`
	TimeoutSeconds       int    `mapstructure:"timeout_seconds"`
	CacheTTLMinutes      int    `mapstructure:"cache_ttl_minutes"`
	UpdateTimeoutSeconds int    `mapstructure:"update_timeout_seconds"`
}

type WebsocketHubConfig struct {
	BufferSize          int `mapstructure:"buffer_size"`
	PingIntervalSeconds int `mapstructure:"ping_interval_seconds"`
	PongWaitSeconds     int `mapstructure:"pong_wait_seconds"`
	WriteWaitSeconds    int `mapstructure:"write_wait_seconds"`
}

type CORSConfig struct {
	AllowedOrigins string `mapstructure:"allowed_origins"`
}

type MonitoringConfig struct {
	IntervalMS               int `mapstructure:"interval_ms"`
	MaxErrors                int `mapstructure:"max_errors"`
	ErrorBackoffSeconds      int `mapstructure:"error_backoff_seconds"`
	BatchSize                int `mapstructure:"batch_size"`
	SessionTimeoutSeconds    int `mapstructure:"session_timeout_seconds"`
	ObserverTimeoutSeconds   int `mapstructure:"observer_timeout_seconds"`
	SchedulerIntervalSeconds int `mapstructure:"scheduler_interval_seconds"`
}

type CleanupConfigData struct {
	CheckIntervalSeconds       int `mapstructure:"check_interval_seconds"`
	CheckTimeoutSeconds        int `mapstructure:"check_timeout_seconds"`
	StuckThresholdSeconds      int `mapstructure:"stuck_threshold_seconds"`
	GetRouterTimeoutSeconds    int `mapstructure:"get_router_timeout_seconds"`
	MaxRetries                 int `mapstructure:"max_retries"`
	RetryDelaySeconds          int `mapstructure:"retry_delay_seconds"`
	PingTimeoutSeconds         int `mapstructure:"ping_timeout_seconds"`
	UpdateStatusTimeoutSeconds int `mapstructure:"update_status_timeout_seconds"`
}

type ConnectionPoolConfig struct {
	MaxPerRouter       int `mapstructure:"max_per_router"`
	IdleTimeoutSeconds int `mapstructure:"idle_timeout_seconds"`
	DialTimeoutSeconds int `mapstructure:"dial_timeout_seconds"`
	MaxRetries         int `mapstructure:"max_retries"`
}

type MikrotikConfig struct {
	ConnectionPool ConnectionPoolConfig `mapstructure:"connection_pool"`
}


type PackagesConfig struct {
	SyncIntervalMinutes int `mapstructure:"sync_interval_minutes"`
}

type Config struct {
	Server     ServerConfig       `mapstructure:"server"`
	Database   DatabaseConfig     `mapstructure:"database"`
	Redis      RedisConfig        `mapstructure:"redis"`
	Websocket  WebsocketHubConfig `mapstructure:"websocket"`
	Monitoring MonitoringConfig   `mapstructure:"monitoring"`
	Mikrotik   MikrotikConfig     `mapstructure:"mikrotik"`

	Cleanup    CleanupConfigData  `mapstructure:"cleanup"`
	Packages   PackagesConfig     `mapstructure:"packages"`
	JWT        JWTConfig          `mapstructure:"jwt"`
	Logging    LoggingConfig      `mapstructure:"logging"`
	CORS       CORSConfig         `mapstructure:"cors"`
}

func LoadConfig() (*ServerConfig, *DatabaseConfig, *RedisConfig, error) {
	cfg, err := LoadFullConfig()
	if err != nil {
		return nil, nil, nil, err
	}
	return &cfg.Server, &cfg.Database, &cfg.Redis, nil
}

func LoadFullConfig() (*Config, error) {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath("./")

	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	if cfg.JWT.Secret == "" || cfg.JWT.Secret == "${JWT_SECRET}" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required but not set or empty")
	}

	if len(cfg.JWT.Secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters long for security")
	}

	return &cfg, nil
}

func (c *Config) ToObserverConfig() ObserverConfig {
	observerConfig := DefaultObserverConfig()

	if c.Monitoring.IntervalMS > 0 {
		observerConfig.Interval = time.Duration(c.Monitoring.IntervalMS) * time.Millisecond
	}
	if c.Monitoring.MaxErrors > 0 {
		observerConfig.MaxErrors = c.Monitoring.MaxErrors
	}
	if c.Monitoring.ErrorBackoffSeconds > 0 {
		observerConfig.ErrorBackoff = time.Duration(c.Monitoring.ErrorBackoffSeconds) * time.Second
	}
	if c.Monitoring.BatchSize > 0 {
		observerConfig.BatchSize = c.Monitoring.BatchSize
	}
	if c.Monitoring.SessionTimeoutSeconds > 0 {
		observerConfig.SessionTimeout = time.Duration(c.Monitoring.SessionTimeoutSeconds) * time.Second
	}
	if c.Monitoring.ObserverTimeoutSeconds > 0 {
		observerConfig.ObserverTimeout = time.Duration(c.Monitoring.ObserverTimeoutSeconds) * time.Second
	}
	if c.Redis.CacheTTLMinutes > 0 {
		observerConfig.RedisCacheTTL = time.Duration(c.Redis.CacheTTLMinutes) * time.Minute
	}
	if c.Monitoring.SchedulerIntervalSeconds > 0 {
		observerConfig.SchedulerInterval = time.Duration(c.Monitoring.SchedulerIntervalSeconds) * time.Second
	}

	return observerConfig
}

func (c *Config) ToCleanupConfig() CleanupConfig {
	cleanupConfig := DefaultCleanupConfig()

	if c.Cleanup.CheckIntervalSeconds > 0 {
		cleanupConfig.CheckInterval = time.Duration(c.Cleanup.CheckIntervalSeconds) * time.Second
	}
	if c.Cleanup.CheckTimeoutSeconds > 0 {
		cleanupConfig.CheckTimeout = time.Duration(c.Cleanup.CheckTimeoutSeconds) * time.Second
	}
	if c.Cleanup.StuckThresholdSeconds > 0 {
		cleanupConfig.StuckThreshold = time.Duration(c.Cleanup.StuckThresholdSeconds) * time.Second
	}
	if c.Cleanup.GetRouterTimeoutSeconds > 0 {
		cleanupConfig.GetRouterTimeout = time.Duration(c.Cleanup.GetRouterTimeoutSeconds) * time.Second
	}
	if c.Cleanup.MaxRetries > 0 {
		cleanupConfig.MaxRetries = c.Cleanup.MaxRetries
	}
	if c.Cleanup.RetryDelaySeconds > 0 {
		cleanupConfig.RetryDelay = time.Duration(c.Cleanup.RetryDelaySeconds) * time.Second
	}
	if c.Cleanup.PingTimeoutSeconds > 0 {
		cleanupConfig.PingTimeout = time.Duration(c.Cleanup.PingTimeoutSeconds) * time.Second
	}
	if c.Cleanup.UpdateStatusTimeoutSeconds > 0 {
		cleanupConfig.UpdateStatusTimeout = time.Duration(c.Cleanup.UpdateStatusTimeoutSeconds) * time.Second
	}

	return cleanupConfig
}

