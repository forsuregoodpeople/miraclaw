package mikrotik_test

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewInterfaceMonitor(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.DefaultMonitorConfig()
	redisClient := &redis.Client{}

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	assert.NotNil(t, monitor)
	assert.NotNil(t, redisClient)
	assert.NotNil(t, routerRepo)
	assert.NotNil(t, connectionPool)
}

func TestInterfaceMonitor_Start(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          100 * time.Millisecond,
		MaxErrors:         3,
		ErrorBackoff:      1 * time.Second,
		SessionTimeout:    2 * time.Second,
		ObserverTimeout:   1 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 100 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(300 * time.Millisecond)

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_GetStats(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.DefaultMonitorConfig()
	redisClient := &redis.Client{}

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	stats := monitor.GetStats()

	assert.NotNil(t, stats)
	assert.Contains(t, stats, "active_monitors")
	assert.Contains(t, stats, "update_interval")
	assert.Contains(t, stats, "monitors")
}

func TestInterfaceMonitor_Stop(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          100 * time.Millisecond,
		MaxErrors:         3,
		ErrorBackoff:      1 * time.Second,
		SessionTimeout:    2 * time.Second,
		ObserverTimeout:   1 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 100 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(200 * time.Millisecond)

	assert.NotPanics(t, func() {
		monitor.Stop()
	})

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_ConfigTimeouts(t *testing.T) {
	tests := []struct {
		name             string
		config           mikrotik.MonitorConfig
		expectedSession  time.Duration
		expectedObserver time.Duration
		expectedRedisTTL time.Duration
	}{
		{
			name:             "Default timeouts",
			config:           mikrotik.DefaultMonitorConfig(),
			expectedSession:  30 * time.Second,
			expectedObserver: 60 * time.Second,
			expectedRedisTTL: 5 * time.Minute,
		},
		{
			name: "Custom timeouts",
			config: mikrotik.MonitorConfig{
				SessionTimeout:    60 * time.Second,
				ObserverTimeout:   120 * time.Second,
				RedisCacheTTL:     10 * time.Minute,
				Interval:          250 * time.Millisecond,
				MaxErrors:         5,
				ErrorBackoff:      30 * time.Second,
				SchedulerInterval: 5 * time.Second,
				BatchSize:         10,
			},
			expectedSession:  60 * time.Second,
			expectedObserver: 120 * time.Second,
			expectedRedisTTL: 10 * time.Minute,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, _, err := sqlmock.New()
			require.NoError(t, err)
			defer db.Close()

			routerRepo := mikrotik.NewRepository(db)
			connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())
			redisClient := &redis.Client{}

			monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, tt.config)
			assert.NotNil(t, monitor)
		})
	}
}

func TestInterfaceMonitor_SchedulerInterval(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          250 * time.Millisecond,
		MaxErrors:         5,
		ErrorBackoff:      30 * time.Second,
		SessionTimeout:    30 * time.Second,
		ObserverTimeout:   60 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 50 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(300 * time.Millisecond)

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_MultipleRouters(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          100 * time.Millisecond,
		MaxErrors:         3,
		ErrorBackoff:      1 * time.Second,
		SessionTimeout:    2 * time.Second,
		ObserverTimeout:   1 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 100 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now).
		AddRow(2, "Router 2", "10.10.10.2", 8728, "admin", "123", 1, now, now).
		AddRow(3, "Router 3", "10.10.10.3", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(300 * time.Millisecond)

	stats := monitor.GetStats()
	assert.Equal(t, 3, stats["active_monitors"])

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_ErrorBackoff(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          100 * time.Millisecond,
		MaxErrors:         3,
		ErrorBackoff:      1 * time.Second,
		SessionTimeout:    2 * time.Second,
		ObserverTimeout:   1 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 100 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(500 * time.Millisecond)

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_RouterDeleted(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          100 * time.Millisecond,
		MaxErrors:         3,
		ErrorBackoff:      1 * time.Second,
		SessionTimeout:    2 * time.Second,
		ObserverTimeout:   1 * time.Second,
		RedisCacheTTL:     5 * time.Minute,
		SchedulerInterval: 100 * time.Millisecond,
		BatchSize:         10,
	}

	redisClient := &redis.Client{}

	now := time.Now()

	rows1 := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows1)

	rows2 := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"})

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows2)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(300 * time.Millisecond)

	stats := monitor.GetStats()
	assert.Equal(t, 0, stats["active_monitors"])

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestInterfaceMonitor_ConnectionPool(t *testing.T) {
	config := mikrotik.DefaultPoolConfig()

	assert.NotNil(t, config)
	assert.Equal(t, 5, config.MaxPerRouter)
	assert.Equal(t, 30*time.Second, config.IdleTimeout)
	assert.Equal(t, 10*time.Second, config.DialTimeout)
	assert.Equal(t, 3, config.MaxRetries)
}

func TestInterfaceMonitor_CustomRouterConfig(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	routerRepo := mikrotik.NewRepository(db)
	connectionPool := mikrotik.NewConnectionPool(mikrotik.DefaultPoolConfig())

	config := mikrotik.MonitorConfig{
		Interval:          200 * time.Millisecond,
		MaxErrors:         10,
		ErrorBackoff:      60 * time.Second,
		SessionTimeout:    60 * time.Second,
		ObserverTimeout:   120 * time.Second,
		RedisCacheTTL:     15 * time.Minute,
		SchedulerInterval: 200 * time.Millisecond,
		BatchSize:         20,
	}

	redisClient := &redis.Client{}

	now := time.Now()
	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Test Router", "10.10.10.1", 8728, "admin", "123", 1, now, now).
		AddRow(2, "Production Router", "192.168.1.1", 8728, "admin", "123", 2, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	monitor := mikrotik.NewInterfaceMonitor(redisClient, routerRepo, connectionPool, config)

	err = monitor.Start()
	require.NoError(t, err)

	time.Sleep(400 * time.Millisecond)

	stats := monitor.GetStats()
	assert.Equal(t, 2, stats["active_monitors"])

	monitor.Stop()

	assert.NoError(t, mock.ExpectationsWereMet())
}
