package api

import (
	"context"
	"log"
	"time"

	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/internal/mikrotik/dhcp"
	"github.com/net-backend/internal/mikrotik/monitoring"
	"github.com/net-backend/internal/mikrotik/pppoe"
	"github.com/net-backend/internal/mikrotik/static"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
)

type Service interface {
	FindAll(ctx context.Context, user users.Users) ([]mikrotik.Router, error)
	FindById(ctx context.Context, id int, user users.Users) (*mikrotik.Router, error)
	Create(ctx context.Context, router *mikrotik.Router, user users.Users) error
	Update(ctx context.Context, router *mikrotik.Router, user users.Users) error
	Delete(ctx context.Context, id int, user users.Users) error
	PingRouter(ctx context.Context, id int, user users.Users) (*PingResult, error)
	UpdateRouterStatus(ctx context.Context, id int, status string, user users.Users) error
	ToggleRouterActive(ctx context.Context, id int, user users.Users) error
}

type service struct {
	repo             mikrotik.RouterRepository
	pingService      *PingService
	interfaceMonitor *monitoring.InterfaceMonitor
	resourceObserver *monitoring.ResourceObserver
	pppoeObserver    *pppoe.PPPOEObserver
	dhcpObserver     *dhcp.DHCPObserver
	staticObserver   *static.StaticObserver
}

func NewService(repo mikrotik.RouterRepository, interfaceMonitor *monitoring.InterfaceMonitor, resourceObserver *monitoring.ResourceObserver, pppoeObserver *pppoe.PPPOEObserver, dhcpObserver *dhcp.DHCPObserver, staticObserver *static.StaticObserver) Service {
	return &service{
		repo:             repo,
		pingService:      NewPingService(),
		interfaceMonitor: interfaceMonitor,
		resourceObserver: resourceObserver,
		pppoeObserver:    pppoeObserver,
		dhcpObserver:     dhcpObserver,
		staticObserver:   staticObserver,
	}
}

func (s *service) FindAll(ctx context.Context, user users.Users) ([]mikrotik.Router, error) {
	if user.Role == users.RoleSuperAdmin {
		return s.repo.FindAll(ctx)
	}

	ownerID := user.ID
	if user.ParentID != nil {
		ownerID = *user.ParentID
	}

	return s.repo.FindAllByMitraID(ctx, ownerID)
}

func (s *service) FindById(ctx context.Context, id int, user users.Users) (*mikrotik.Router, error) {
	router, err := s.repo.FindById(ctx, id)
	if err != nil {
		return nil, err
	}

	if user.Role == users.RoleSuperAdmin {
		return router, nil
	}

	ownerID := user.ID
	if user.ParentID != nil {
		ownerID = *user.ParentID
	}

	if router.MitraID != ownerID {
		return nil, pkg.NewError("You assume ownership of this router? Think again.")
	}

	return router, nil
}

func (s *service) Create(ctx context.Context, router *mikrotik.Router, user users.Users) error {
	if user.Role != users.RoleSuperAdmin && user.Role != users.RoleMitra {
		return pkg.NewError("Only SuperAdmin and Mitra can create routers")
	}

	router.MitraID = user.ID
	// Default router to active if not specified
	router.IsActive = true
	// Initial status will be updated by async ping
	router.Status = "Pinging"

	// Create router first
	err := s.repo.Create(ctx, router)
	if err != nil {
		return err
	}

	log.Printf("[CREATE] Router %d (%s) created with status=Pinging, starting async ping...", router.ID, router.Name)

	// Ping asynchronously to update status with retry mechanism
	go s.asyncPingAndUpdateStatusWithRetry(router.ID, router.Host, router.Port, router.Name)

	// Start all observers immediately for the new router (don't wait for scheduler tick)
	go func() {
		time.Sleep(2 * time.Second)
		if s.dhcpObserver != nil {
			s.dhcpObserver.StartRouterObserver(router.ID)
		}
		if s.pppoeObserver != nil {
			s.pppoeObserver.StartRouterObserver(router.ID)
		}
		if s.staticObserver != nil {
			s.staticObserver.StartRouterObserver(router.ID)
		}
		if s.resourceObserver != nil {
			s.resourceObserver.StartRouterObserver(router.ID)
		}
		if s.interfaceMonitor != nil {
			s.interfaceMonitor.StartRouterMonitor(router.ID)
		}
		log.Printf("[CREATE] All observers started for new router %d (%s)", router.ID, router.Name)
	}()

	log.Printf("[CREATE] Router %d (%s) created successfully, async ping with retry started", router.ID, router.Name)
	return nil
}

func (s *service) Update(ctx context.Context, router *mikrotik.Router, user users.Users) error {
	existingRouter, err := s.FindById(ctx, router.ID, user)
	if err != nil {
		return err
	}

	if user.Role != users.RoleSuperAdmin && user.Role != users.RoleMitra {
		return pkg.NewError("Only SuperAdmin and Mitra can update routers")
	}

	// Preserve existing password if new password is empty
	if router.Password == "" {
		router.Password = existingRouter.Password
	}

	router.MitraID = existingRouter.MitraID
	// Preserve is_active status unless explicitly changed
	router.IsActive = existingRouter.IsActive

	err = s.repo.Update(ctx, router)
	if err != nil {
		return err
	}

	// Ping asynchronously to update status if router is active
	if router.IsActive {
		log.Printf("[UPDATE] Router %d (%s) updated, starting async ping with retry...", router.ID, router.Name)
		go s.asyncPingAndUpdateStatusWithRetry(router.ID, router.Host, router.Port, router.Name)
	} else {
		log.Printf("[UPDATE] Router %d (%s) updated but not active, skipping ping", router.ID, router.Name)
	}

	log.Printf("[UPDATE] Router %d (%s) updated successfully", router.ID, router.Name)
	return nil
}

func (s *service) Delete(ctx context.Context, id int, user users.Users) error {
	_, err := s.FindById(ctx, id, user)
	if err != nil {
		return err
	}

	if user.Role != users.RoleSuperAdmin && user.Role != users.RoleMitra {
		return pkg.NewError("Only SuperAdmin and Mitra can delete routers")
	}

	return s.repo.Delete(ctx, id)
}

func (s *service) ToggleRouterActive(ctx context.Context, id int, user users.Users) error {
	router, err := s.FindById(ctx, id, user)
	if err != nil {
		return err
	}

	if user.Role != users.RoleSuperAdmin && user.Role != users.RoleMitra {
		return pkg.NewError("Only SuperAdmin and Mitra can toggle router active status")
	}

	newActiveState := !router.IsActive

	// Ping to determine status if activating
	if newActiveState {
		pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer pingCancel()

		result, pingErr := s.pingService.PingRouterWithFallback(pingCtx, router.Host, router.Port)
		if pingErr != nil {
			log.Printf("Ping failed during activation for router %d: %v", id, pingErr)
			router.Status = "down"
		} else if result.Success {
			router.Status = "up"
		} else {
			router.Status = "down"
		}
		log.Printf("Router %d activated, status: %s (latency: %.2fms)", id, router.Status, result.Latency)

		// Start all observers immediately when activating
		go func() {
			if s.dhcpObserver != nil {
				s.dhcpObserver.StartRouterObserver(id)
			}
			if s.pppoeObserver != nil {
				s.pppoeObserver.StartRouterObserver(id)
			}
			if s.staticObserver != nil {
				s.staticObserver.StartRouterObserver(id)
			}
			if s.resourceObserver != nil {
				s.resourceObserver.StartRouterObserver(id)
			}
			if s.interfaceMonitor != nil {
				s.interfaceMonitor.StartRouterMonitor(id)
			}
			log.Printf("[TOGGLE] All observers started for activated router %d", id)
		}()
	} else {
		router.Status = "inactive"
		log.Printf("Router %d deactivated", id)

		// Stop all monitoring for this router
		if s.interfaceMonitor != nil {
			s.interfaceMonitor.StopRouterMonitor(id)
		}
		if s.resourceObserver != nil {
			s.resourceObserver.StopRouterObserver(id)
		}
		if s.pppoeObserver != nil {
			s.pppoeObserver.StopRouterObserver(id)
		}
		if s.dhcpObserver != nil {
			s.dhcpObserver.StopRouterObserver(id)
		}
		if s.staticObserver != nil {
			s.staticObserver.StopRouterObserver(id)
		}
	}
	router.IsActive = newActiveState
	return s.repo.Update(ctx, router)
}

func (s *service) PingRouter(ctx context.Context, id int, user users.Users) (*PingResult, error) {
	router, err := s.FindById(ctx, id, user)
	if err != nil {
		return nil, err
	}

	// Don't ping inactive routers
	if !router.IsActive {
		return &PingResult{
			Success:   false,
			Latency:   0,
			Error:     "Router is inactive",
			Timestamp: time.Now().Format(time.RFC3339),
		}, nil
	}

	return s.pingService.PingRouterWithFallback(ctx, router.Host, router.Port)
}

func (s *service) UpdateRouterStatus(ctx context.Context, id int, status string, user users.Users) error {
	router, err := s.FindById(ctx, id, user)
	if err != nil {
		return err
	}

	if user.Role != users.RoleSuperAdmin && user.Role != users.RoleMitra {
		return pkg.NewError("Only SuperAdmin and Mitra can update router status")
	}

	router.Status = status
	return s.repo.Update(ctx, router)
}

func (s *service) asyncPingAndUpdateStatus(routerID int, host string, port int, name string) {
	log.Printf("[ASYNC-PING-START] Starting async ping for router %d (%s) at %s:%d", routerID, name, host, port)

	// Check if router is still active before pinging
	checkCtx, checkCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer checkCancel()

	router, err := s.repo.FindById(checkCtx, routerID)
	if err != nil {
		log.Printf("[ASYNC-PING-ERROR] Failed to get router %d: %v", routerID, err)
		return
	}

	if !router.IsActive {
		log.Printf("[ASYNC-PING-SKIP] Router %d (%s) is not active, skipping ping", routerID, name)
		return
	}

	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer pingCancel()

	log.Printf("[ASYNC-PING] Pinging router %d (%s) at %s:%d", routerID, name, host, port)

	result, err := s.pingService.PingRouterWithFallback(pingCtx, host, port)
	if err != nil {
		log.Printf("[ASYNC-PING-ERROR] Ping failed for router %d (%s): %v", routerID, name, err)
		s.updateRouterStatusInDB(routerID, "down", name)
		return
	}

	status := "down"
	if result.Success {
		status = "up"
		log.Printf("[ASYNC-PING-SUCCESS] Ping successful for router %d (%s), latency: %.2fms", routerID, name, result.Latency)
	} else {
		log.Printf("[ASYNC-PING-FAILED] Ping unsuccessful for router %d (%s), latency: %.2fms, error: %s", routerID, name, result.Latency, result.Error)
	}

	s.updateRouterStatusInDB(routerID, status, name)
}

func (s *service) asyncPingAndUpdateStatusWithRetry(routerID int, host string, port int, name string) {
	// Check if router is still active before starting retry loop
	checkCtx, checkCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer checkCancel()

	router, err := s.repo.FindById(checkCtx, routerID)
	if err != nil {
		log.Printf("[ASYNC-PING-RETRY-ERROR] Failed to get router %d: %v", routerID, err)
		return
	}

	if !router.IsActive {
		log.Printf("[ASYNC-PING-RETRY-SKIP] Router %d (%s) is not active, skipping ping retry", routerID, name)
		return
	}

	maxRetries := 3
	retryDelay := 2 * time.Second

	for attempt := 1; attempt <= maxRetries; attempt++ {
		// Check again before each attempt
		checkCtx2, checkCancel2 := context.WithTimeout(context.Background(), 2*time.Second)
		router, err = s.repo.FindById(checkCtx2, routerID)
		checkCancel2()

		if err != nil {
			log.Printf("[ASYNC-PING-RETRY-ERROR] Failed to get router %d on attempt %d: %v", routerID, attempt, err)
			break
		}

		if !router.IsActive {
			log.Printf("[ASYNC-PING-RETRY-SKIP] Router %d (%s) is no longer active on attempt %d, stopping", routerID, name, attempt)
			return
		}

		log.Printf("[ASYNC-PING-RETRY] Attempt %d/%d for router %d (%s)", attempt, maxRetries, routerID, name)

		pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)

		result, err := s.pingService.PingRouterWithFallback(pingCtx, host, port)
		pingCancel()

		if err != nil {
			log.Printf("[ASYNC-PING-RETRY-ERROR] Ping failed for router %d (%s) on attempt %d: %v", routerID, name, attempt, err)
			if attempt < maxRetries {
				time.Sleep(retryDelay)
				continue
			}
			// Last attempt failed, set status to down
			s.updateRouterStatusInDB(routerID, "down", name)
			return
		}

		status := "down"
		if result.Success {
			status = "up"
			log.Printf("[ASYNC-PING-RETRY-SUCCESS] Ping successful for router %d (%s) on attempt %d, latency: %.2fms", routerID, name, attempt, result.Latency)
		} else {
			log.Printf("[ASYNC-PING-RETRY-FAILED] Ping unsuccessful for router %d (%s) on attempt %d, latency: %.2fms, error: %s", routerID, name, attempt, result.Latency, result.Error)
			if attempt < maxRetries {
				time.Sleep(retryDelay)
				continue
			}
		}

		// Update status in database
		s.updateRouterStatusInDB(routerID, status, name)
		return
	}
}

func (s *service) updateRouterStatusInDB(routerID int, status string, name string) {
	updateCtx, updateCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer updateCancel()

	log.Printf("[UPDATE-STATUS] Updating router %d (%s) status to %s", routerID, name, status)

	if updateErr := s.repo.UpdateStatus(updateCtx, routerID, status); updateErr != nil {
		log.Printf("[UPDATE-STATUS-ERROR] Failed to update router %d status: %v", routerID, updateErr)
	} else {
		log.Printf("[UPDATE-STATUS-SUCCESS] Router %d (%s) status updated to %s successfully", routerID, name, status)
	}
}
