package pelanggan

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	redisclient "github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik/dhcp"
	"github.com/net-backend/internal/mikrotik/pppoe"
	"github.com/net-backend/internal/mikrotik/static"
	"github.com/net-backend/pkg/logger"
	goredis "github.com/redis/go-redis/v9"
)

type Service interface {
	GetAll(ctx context.Context, routerID int) ([]Pelanggan, error)
	Isolir(ctx context.Context, pelangganType string, originalID int) error
	UnIsolir(ctx context.Context, pelangganType string, originalID int) error
	Block(ctx context.Context, routerID int, pelangganType string, originalID int) error
}

type service struct {
	dhcpService   dhcp.IDHCPService
	pppoeService  pppoe.Service
	staticService static.IStaticService
	redisClient   *redisclient.Client
}

func NewService(
	dhcpService dhcp.IDHCPService,
	pppoeService pppoe.Service,
	staticService static.IStaticService,
	redisClient *redisclient.Client,
) Service {
	return &service{
		dhcpService:   dhcpService,
		pppoeService:  pppoeService,
		staticService: staticService,
		redisClient:   redisClient,
	}
}

func (s *service) GetAll(ctx context.Context, routerID int) ([]Pelanggan, error) {
	var (
		mu            sync.Mutex
		wg            sync.WaitGroup
		dhcpLeases    []dhcp.DHCPLease
		pppoeSecrets  []pppoe.Secret
		staticBinds   []static.StaticBinding
		activeNames   = make(map[string]bool)
		activeUptimes = make(map[string]string)
	)

	wg.Add(3)

	go func() {
		defer wg.Done()
		leases, err := s.dhcpService.GetAllLeases(ctx, routerID)
		if err != nil {
			logger.Log.WithField("component", "pelanggan").WithError(err).Warn("Failed to fetch DHCP leases")
			return
		}
		mu.Lock()
		dhcpLeases = leases
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		secrets, err := s.pppoeService.FindAll(ctx, routerID)
		if err != nil {
			logger.Log.WithField("component", "pelanggan").WithError(err).Warn("Failed to fetch PPPoE secrets")
			return
		}
		mu.Lock()
		pppoeSecrets = secrets
		mu.Unlock()
	}()

	go func() {
		defer wg.Done()
		bindings, err := s.staticService.GetAllBindings(ctx, routerID)
		if err != nil {
			logger.Log.WithField("component", "pelanggan").WithError(err).Warn("Failed to fetch Static bindings")
			return
		}
		mu.Lock()
		staticBinds = bindings
		mu.Unlock()
	}()

	wg.Wait()

	// Fetch active PPPoE sessions from Redis (same key as PPPOEObserver writes)
	cacheKey := fmt.Sprintf("mikrotik:pppoe:%d", routerID)
	cached, err := s.redisClient.Get(ctx, cacheKey)
	if err != nil && err != goredis.Nil {
		logger.Log.WithField("component", "pelanggan").WithError(err).Warn("Failed to fetch PPPoE sessions from Redis")
	} else if err == nil {
		var sessions []map[string]interface{}
		if jsonErr := json.Unmarshal([]byte(cached), &sessions); jsonErr == nil {
			for _, sess := range sessions {
				if name, ok := sess["name"].(string); ok && name != "" {
					activeNames[name] = true
					if uptime, ok := sess["uptime"].(string); ok {
						activeUptimes[name] = uptime
					}
				}
			}
		}
	}

	// Fetch active DHCP leases from Redis (same key as DHCPObserver writes)
	dhcpActiveByAddr := make(map[string]bool)
	dhcpCacheKey := fmt.Sprintf("mikrotik:dhcp:%d", routerID)
	dhcpCached, dhcpErr := s.redisClient.Get(ctx, dhcpCacheKey)
	if dhcpErr != nil && dhcpErr != goredis.Nil {
		logger.Log.WithField("component", "pelanggan").WithError(dhcpErr).Warn("Failed to fetch DHCP leases from Redis")
	} else if dhcpErr == nil {
		var dhcpEntries []map[string]interface{}
		if jsonErr := json.Unmarshal([]byte(dhcpCached), &dhcpEntries); jsonErr == nil {
			for _, entry := range dhcpEntries {
				addr, _ := entry["address"].(string)
				active, _ := entry["active_state"].(bool)
				if addr != "" && active {
					dhcpActiveByAddr[addr] = true
				}
			}
		}
	}

	// Build result slice
	result := make([]Pelanggan, 0, len(dhcpLeases)+len(pppoeSecrets)+len(staticBinds))

	// Map DHCP leases
	for _, lease := range dhcpLeases {
		// Skip dynamic leases not present in Redis — they are expired/gone from MikroTik
		activeFromRedis := dhcpActiveByAddr[lease.Address]
		if lease.Dynamic && !activeFromRedis && !lease.IsIsolir {
			continue
		}
		name := lease.Comment
		if name == "" {
			name = lease.HostName
		}
		if name == "" {
			name = lease.Address
		}
		status := "DOWN"
		// Prefer Redis real-time data; fall back to DB active_state
		if (activeFromRedis || lease.ActiveState) && !lease.IsIsolir {
			status = "UP"
		}
		result = append(result, Pelanggan{
			ID:         fmt.Sprintf("dhcp-%d", lease.ID),
			Name:       name,
			Type:       "DHCP",
			IP:         lease.Address,
			MAC:        lease.MACAddress,
			Status:     status,
			IsIsolir:   lease.IsIsolir,
			LastSeen:   lease.LastSeen,
			RouterID:   routerID,
			OriginalID: lease.ID,
			Comment:    lease.Comment,
			Profile:    lease.Server,
		})
	}

	// Map PPPoE secrets
	for _, secret := range pppoeSecrets {
		name := secret.Comment
		if name == "" {
			name = secret.Name
		}
		status := "DOWN"
		if activeNames[secret.Name] && !secret.Disabled {
			status = "UP"
		}
		lastSeen := ""
		if up, ok := activeUptimes[secret.Name]; ok {
			lastSeen = up
		}
		result = append(result, Pelanggan{
			ID:         fmt.Sprintf("pppoe-%d", secret.ID),
			Name:       name,
			Type:       "PPPOE",
			IP:         secret.RemoteAddress,
			Username:   secret.Name,
			Status:     status,
			IsIsolir:   secret.Disabled,
			LastSeen:   lastSeen,
			RouterID:   routerID,
			OriginalID: secret.ID,
			Comment:    secret.Comment,
			Profile:    secret.Profile,
		})
	}

	// Map Static bindings
	for _, binding := range staticBinds {
		name := binding.Comment
		if name == "" {
			name = binding.Address
		}
		status := "DOWN"
		if !binding.IsDisabled && binding.Type != "blocked" {
			status = "UP"
		}
		
		lastSeen := binding.LastSeen
		if lastSeen == "" {
			for _, lease := range dhcpLeases {
				if lease.MACAddress == binding.MACAddress {
					lastSeen = lease.LastSeen
					break
				}
			}
		}

		result = append(result, Pelanggan{
			ID:         fmt.Sprintf("static-%d", binding.ID),
			Name:       name,
			Type:       "STATIC",
			IP:         binding.Address,
			MAC:        binding.MACAddress,
			Status:     status,
			IsIsolir:   binding.IsDisabled || binding.Type == "blocked",
			LastSeen:   lastSeen,
			RouterID:   routerID,
			OriginalID: binding.ID,
			Comment:    binding.Comment,
		})
	}

	return result, nil
}

func (s *service) Isolir(ctx context.Context, pelangganType string, originalID int) error {
	switch pelangganType {
	case "DHCP":
		return s.dhcpService.DisableLease(ctx, originalID)
	case "PPPOE":
		secret, err := s.pppoeService.FindById(ctx, originalID)
		if err != nil {
			return fmt.Errorf("PPPoE secret not found: %w", err)
		}
		secret.Disabled = true
		return s.pppoeService.Update(ctx, secret)
	case "STATIC":
		return s.staticService.BlockBinding(ctx, originalID)
	default:
		return fmt.Errorf("unknown pelanggan type: %s", pelangganType)
	}
}

func (s *service) UnIsolir(ctx context.Context, pelangganType string, originalID int) error {
	switch pelangganType {
	case "DHCP":
		return s.dhcpService.EnableLease(ctx, originalID)
	case "PPPOE":
		secret, err := s.pppoeService.FindById(ctx, originalID)
		if err != nil {
			return fmt.Errorf("PPPoE secret not found: %w", err)
		}
		secret.Disabled = false
		return s.pppoeService.Update(ctx, secret)
	case "STATIC":
		return s.staticService.UnblockBinding(ctx, originalID)
	default:
		return fmt.Errorf("unknown pelanggan type: %s", pelangganType)
	}
}

func (s *service) Block(ctx context.Context, routerID int, pelangganType string, originalID int) error {
	switch pelangganType {
	case "DHCP":
		// Block DHCP renewal via block-access=yes + firewall isolir list
		return s.dhcpService.BlockLease(ctx, originalID)
	case "PPPOE":
		secret, err := s.pppoeService.FindById(ctx, originalID)
		if err != nil {
			return fmt.Errorf("PPPoE secret not found: %w", err)
		}
		secret.Disabled = true
		if err := s.pppoeService.Update(ctx, secret); err != nil {
			return fmt.Errorf("failed to disable PPPoE secret: %w", err)
		}
		// Kick active session — best effort, ignore if no active session
		if err := s.pppoeService.DisconnectSession(ctx, routerID, secret.Name); err != nil {
			logger.Log.WithField("component", "pelanggan").WithError(err).Warn("Failed to disconnect active session during block")
		}
		return nil
	case "STATIC":
		return s.staticService.BlockBinding(ctx, originalID)
	default:
		return fmt.Errorf("unknown pelanggan type: %s", pelangganType)
	}
}
