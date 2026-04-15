package app

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/customer"
	"github.com/net-backend/internal/finance"
	"github.com/net-backend/internal/packages"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/internal/mikrotik/api"
	"github.com/net-backend/internal/mikrotik/dhcp"
	mikrotikmonitoring "github.com/net-backend/internal/mikrotik/monitoring"
	"github.com/net-backend/internal/mikrotik/pelanggan"
	"github.com/net-backend/internal/mikrotik/pppoe"
	"github.com/net-backend/internal/mikrotik/static"
	"github.com/net-backend/internal/optical"
	"github.com/net-backend/internal/session"
	"github.com/net-backend/internal/ticket"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/internal/websocket"
	"github.com/net-backend/pkg"
	"github.com/net-backend/pkg/logger"
	ratelimiter "github.com/net-backend/pkg/middleware"
)

func Run() {
	fullConfig, err := config.LoadFullConfig()
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		return
	}

	logger.Init(fullConfig.Logging.Level, fullConfig.Logging.Format, fullConfig.Logging.Colors)
	logger.Log.WithField("component", "app").Info("Starting application...")

	serverCfg := &fullConfig.Server
	dbCfg := &fullConfig.Database
	redisCfg := &fullConfig.Redis
	jwtCfg := &fullConfig.JWT

	pkg.SetJWTSecret(jwtCfg.Secret)
	pkg.SetJWTExpirationHours(jwtCfg.ExpirationHours)

	db := config.NewDB(*dbCfg)
	redisClient, err := redis.NewClient(*redisCfg)
	if err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Error initializing Redis")
	}

	sessionStore := session.NewSession(redisClient, jwtCfg.ExpirationHours)
	sessionMiddleware := session.NewMiddleware(sessionStore)

	userRepo := users.NewUserRepository(db)
	userService := users.NewUserService(userRepo)
	userHandler := users.NewUserHandler(userService, sessionStore)

	customerRepo := customer.NewRepository(db)

	financeRepo := finance.NewRepository(db)
	financeService := finance.NewService(financeRepo)
	financeHandler := finance.NewHandler(financeService)

	mikrotikRepo := mikrotik.NewRepository(db)

	poolConfig := mikrotik.DefaultPoolConfig()
	poolConfig.MaxPerRouter = fullConfig.Mikrotik.ConnectionPool.MaxPerRouter
	poolConfig.IdleTimeout = time.Duration(fullConfig.Mikrotik.ConnectionPool.IdleTimeoutSeconds) * time.Second
	poolConfig.DialTimeout = time.Duration(fullConfig.Mikrotik.ConnectionPool.DialTimeoutSeconds) * time.Second
	poolConfig.MaxRetries = fullConfig.Mikrotik.ConnectionPool.MaxRetries

	connectionPool := mikrotik.NewConnectionPool(poolConfig)
	logger.Log.WithField("component", "app").WithField("max_connections", poolConfig.MaxPerRouter).Info("Connection pool initialized")

	terminalService := api.NewTerminalService(mikrotikRepo, connectionPool)

	pppoeRepo := pppoe.NewRepository(db)
	pppoeService := pppoe.NewService(pppoeRepo, mikrotikRepo, connectionPool)

	dhcpRepo := dhcp.NewDHCPLeaseRepository(db)
	dhcpService := dhcp.NewDHCPService(dhcpRepo, mikrotikRepo, connectionPool)
	dhcpHandler := dhcp.NewDHCPHandler(dhcpService)

	staticRepo := static.NewStaticBindingRepository(db)
	staticService := static.NewStaticService(staticRepo, mikrotikRepo, connectionPool)
	staticHandler := static.NewStaticHandler(staticService)

	pelangganService := pelanggan.NewService(dhcpService, pppoeService, staticService, redisClient)
	pelangganHandler := pelanggan.NewHandler(pelangganService)

	customerService := customer.NewService(customerRepo, pelangganService)
	customerHandler := customer.NewHandler(customerService)

	packageRepo := packages.NewRepository(db)
	packageService := packages.NewService(packageRepo, db, mikrotikRepo, connectionPool, pppoeService)
	packageHandler := packages.NewHandler(packageService, userService)

	syncValidatorInterval := 15 * time.Minute
	if fullConfig.Packages.SyncIntervalMinutes > 0 {
		syncValidatorInterval = time.Duration(fullConfig.Packages.SyncIntervalMinutes) * time.Minute
	}
	packageSyncValidator := packages.NewSyncValidator(
		packageService,
		func(ctx context.Context) ([]int, error) {
			routers, err := mikrotikRepo.FindAll(ctx)
			if err != nil {
				return nil, err
			}
			ids := make([]int, 0, len(routers))
			for _, r := range routers {
				if r.IsActive {
					ids = append(ids, r.ID)
				}
			}
			return ids, nil
		},
		syncValidatorInterval,
	)
	packageSyncValidator.Start()

	monitorConfig := mikrotikmonitoring.DefaultMonitorConfig()
	monitorConfig.Interval = time.Duration(fullConfig.Monitoring.IntervalMS) * time.Millisecond
	monitorConfig.MaxErrors = fullConfig.Monitoring.MaxErrors
	monitorConfig.ErrorBackoff = time.Duration(fullConfig.Monitoring.ErrorBackoffSeconds) * time.Second
	monitorConfig.BatchSize = fullConfig.Monitoring.BatchSize
	monitorConfig.SessionTimeout = time.Duration(fullConfig.Monitoring.SessionTimeoutSeconds) * time.Second
	monitorConfig.ObserverTimeout = time.Duration(fullConfig.Monitoring.ObserverTimeoutSeconds) * time.Second
	if fullConfig.Redis.CacheTTLMinutes > 0 {
		monitorConfig.RedisCacheTTL = time.Duration(fullConfig.Redis.CacheTTLMinutes) * time.Minute
	}
	if fullConfig.Monitoring.SchedulerIntervalSeconds > 0 {
		monitorConfig.SchedulerInterval = time.Duration(fullConfig.Monitoring.SchedulerIntervalSeconds) * time.Second
	}

	interfaceMonitor := mikrotikmonitoring.NewInterfaceMonitor(
		redisClient,
		mikrotikRepo,
		connectionPool,
		monitorConfig,
	)

	if err := interfaceMonitor.Start(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Failed to start interface monitoring service")
	}
	logger.Log.WithField("component", "app").WithField("interval", monitorConfig.Interval).Info("Interface monitoring service started")

	observerConfig := fullConfig.ToObserverConfig()

	resourceObserver := mikrotikmonitoring.NewResourceObserver(
		redisClient,
		mikrotikRepo,
		connectionPool,
		observerConfig,
	)

	if err := resourceObserver.Start(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Failed to start resource observer service")
	}
	logger.Log.WithField("component", "app").WithField("interval", observerConfig.Interval).Info("Resource observer service started")

	pppoeObserver := pppoe.NewPPPOEObserver(
		redisClient,
		mikrotikRepo,
		connectionPool,
		pppoeRepo,
		observerConfig,
	)

	if err := pppoeObserver.Start(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Failed to start PPPoE observer service")
	}
	logger.Log.WithField("component", "app").WithField("interval", observerConfig.Interval).Info("PPPoE observer service started")

	pppoeHandler := pppoe.NewHandler(pppoeService, redisClient, pppoeObserver)

	dhcpObserver := dhcp.NewDHCPObserver(
		redisClient,
		mikrotikRepo,
		connectionPool,
		dhcpRepo,
		observerConfig,
	)

	if err := dhcpObserver.Start(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Failed to start DHCP observer service")
	}
	logger.Log.WithField("component", "app").WithField("interval", observerConfig.Interval).Info("DHCP observer service started")

	staticObserver := static.NewStaticObserver(
		redisClient,
		mikrotikRepo,
		connectionPool,
		staticRepo,
		observerConfig,
	)

	if err := staticObserver.Start(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Failed to start static observer service")
	}
	logger.Log.WithField("component", "app").WithField("interval", observerConfig.Interval).Info("Static observer service started")

	// --- Optical / GenieACS domain ---
	opticalRepo := optical.NewRepository(db)
	dbURL, _ := opticalRepo.GetSetting(context.Background(), "genieacs.url")
	dbUser, _ := opticalRepo.GetSetting(context.Background(), "genieacs.username")
	dbPass, _ := opticalRepo.GetSetting(context.Background(), "genieacs.password")
	acsClient := optical.NewGenieACSClient(optical.GenieACSConfig{
		BaseURL:  dbURL,
		Username: dbUser,
		Password: dbPass,
		Timeout:  30 * time.Second,
	})

	opticalService := optical.NewService(opticalRepo, acsClient)
	opticalHandler := optical.NewHandler(opticalService)

	pollerCfg := optical.DefaultPollerConfig()

	opticalPoller := optical.NewPoller(pollerCfg, opticalRepo, acsClient, redisClient)
	opticalPoller.Start()
	logger.Log.WithField("component", "app").Info("Optical poller started")

	// Create mikrotik service with monitors
	mikrotikService := api.NewService(mikrotikRepo, interfaceMonitor, resourceObserver, pppoeObserver, dhcpObserver, staticObserver)

	// Start cleanup service for stuck routers
	cleanupConfig := fullConfig.ToCleanupConfig()
	cleanupService := api.NewCleanupService(mikrotikRepo, cleanupConfig)
	cleanupService.StartBackgroundCleanup()

	mikrotikHandler := api.NewHandler(mikrotikService, userService, terminalService, redisClient)

	hubConfig := config.DefaultHubConfig()
	if fullConfig.Websocket.BufferSize > 0 {
		hubConfig.BufferSize = fullConfig.Websocket.BufferSize
	}
	if fullConfig.Websocket.PingIntervalSeconds > 0 {
		hubConfig.PingInterval = time.Duration(fullConfig.Websocket.PingIntervalSeconds) * time.Second
	}
	if fullConfig.Websocket.PongWaitSeconds > 0 {
		hubConfig.PongWait = time.Duration(fullConfig.Websocket.PongWaitSeconds) * time.Second
	}
	if fullConfig.Websocket.WriteWaitSeconds > 0 {
		hubConfig.WriteWait = time.Duration(fullConfig.Websocket.WriteWaitSeconds) * time.Second
	}

	hub := websocket.NewHub(hubConfig)

	go hub.Run()
	logger.Log.WithField("component", "app").WithField("buffer_size", hubConfig.BufferSize).Info("WebSocket hub started")

	wsHandler := websocket.NewWebsocketHandler(hub, redisClient)

	app := fiber.New(fiber.Config{
		IdleTimeout:  time.Duration(serverCfg.IdleTimeoutSeconds) * time.Second,
		ReadTimeout:  time.Duration(serverCfg.ReadTimeoutSeconds) * time.Second,
		WriteTimeout: time.Duration(serverCfg.WriteTimeoutSeconds) * time.Second,
	})

	corsOrigins := fullConfig.CORS.AllowedOrigins
	if corsOrigins == "" {
		corsOrigins = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
	}

	app.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigins,
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,Upgrade,Connection,Sec-WebSocket-Key,Sec-WebSocket-Version,Sec-WebSocket-Extensions,Sec-WebSocket-Protocol",
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowCredentials: true,
		ExposeHeaders:    "Content-Length,Set-Cookie",
	}))

	app.Use(ratelimiter.RateLimit(2000, time.Minute))

	// Serve uploaded receipt images
	app.Static("/uploads", "./uploads")

	// Routes
	v1 := app.Group("v1")
	users.RegisterRoutes(app, userHandler, sessionMiddleware)
	pppoe.RegisterRoutes(v1, pppoeHandler, sessionMiddleware.Auth())
	dhcp.RegisterDHCPRoutes(v1, dhcpHandler, sessionMiddleware.Auth())
	static.RegisterStaticRoutes(v1, staticHandler, sessionMiddleware.Auth())
	pelanggan.RegisterRoutes(v1, pelangganHandler, sessionMiddleware.Auth())
	api.RegisterRoutes(app, mikrotikHandler, sessionMiddleware)
	optical.RegisterRoutes(v1, opticalHandler, sessionMiddleware.Auth())
	customer.RegisterRoutes(v1, customerHandler, sessionMiddleware.Auth())
	packages.RegisterRoutes(v1, packageHandler, sessionMiddleware.Auth())
	finance.RegisterRoutes(v1, financeHandler, sessionMiddleware.Auth())
	ticketRepo := ticket.NewRepository(db)
	ticketService := ticket.NewService(ticketRepo)
	ticketHandler := ticket.NewHandler(ticketService)
	ticket.RegisterRoutes(v1, ticketHandler, sessionMiddleware.Auth())
	websocket.RegisterRoutes(app, wsHandler, sessionMiddleware)

	// Start Redis PubSub listener for WebSocket hub
	redisPubSub, err := redisClient.PSubscribe(context.Background(), "router:*:resources", "router:*:interfaces", "router:*:pppoe", "router:*:dhcp", "router:*:static", "optical:device:*:status")
	if err != nil {
		logger.Log.WithField("component", "app").WithError(err).Fatal("Error creating Redis PubSub")
	}
	hub.StartRedisListener(redisPubSub)
	logger.Log.WithField("component", "app").Info("Redis PubSub listener started for WebSocket hub")

	baseUrl := fmt.Sprintf("%s:%d", serverCfg.Host, serverCfg.Port)
	logger.Log.WithField("component", "app").WithField("address", baseUrl).Info("Server listening")
	logger.Log.WithField("component", "app").WithField("interval", monitorConfig.Interval).Info("Realtime monitoring active")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := app.Listen(baseUrl); err != nil {
			logger.Log.WithField("component", "app").WithError(err).Fatal("Server failed to start")
		}
	}()

	<-quit
	logger.Log.WithField("component", "app").Info("Shutdown signal received, stopping services...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Error("HTTP server shutdown error")
	}

	hub.Stop()
	packageSyncValidator.Stop()
	interfaceMonitor.Stop()
	resourceObserver.Stop()
	pppoeObserver.Stop()
	dhcpObserver.Stop()
	staticObserver.Stop()
	opticalPoller.Stop()
	connectionPool.Stop()

	if err := redisPubSub.Close(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Error("Redis PubSub close error")
	}
	if err := redisClient.Close(); err != nil {
		logger.Log.WithField("component", "app").WithError(err).Error("Redis client close error")
	}
	db.Close()

	logger.Log.WithField("component", "app").Info("All services stopped cleanly")
}
