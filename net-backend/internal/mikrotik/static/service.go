package static

import (
	"context"
	"fmt"

	"github.com/go-routeros/routeros"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type IStaticService interface {
	GetAllBindings(ctx context.Context, routerID int) ([]StaticBinding, error)
	GetBindingByID(ctx context.Context, id int) (*StaticBinding, error)
	CreateBinding(ctx context.Context, binding *StaticBinding, routerID int) (*StaticBinding, error)
	UpdateBinding(ctx context.Context, binding *StaticBinding) error
	BlockBinding(ctx context.Context, id int) error
	UnblockBinding(ctx context.Context, id int) error
	DeleteBinding(ctx context.Context, id int) error
	SyncFromRouter(ctx context.Context, routerID int) ([]StaticBinding, error)
	GetHotspotServers(ctx context.Context, routerID int) ([]HotspotServer, error)
	CreateHotspotServer(ctx context.Context, routerID int, server *HotspotServer) error
}

type StaticService struct {
	repo           IStaticBindingRepository
	routerRepo     mikrotik.RouterRepository
	connectionPool *mikrotik.ConnectionPool
}

func NewStaticService(
	repo IStaticBindingRepository,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
) IStaticService {
	return &StaticService{
		repo:           repo,
		routerRepo:     routerRepo,
		connectionPool: connectionPool,
	}
}

func (s *StaticService) GetAllBindings(ctx context.Context, routerID int) ([]StaticBinding, error) {
	return s.repo.FindAll(ctx, routerID)
}

func (s *StaticService) GetBindingByID(ctx context.Context, id int) (*StaticBinding, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *StaticService) CreateBinding(ctx context.Context, binding *StaticBinding, routerID int) (*StaticBinding, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return nil, fmt.Errorf("cannot create static binding on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	bindingType := binding.Type
	if bindingType == "" {
		bindingType = "regular"
	}

	reply, err := conn.Run("/ip/hotspot/ip-binding/add",
		fmt.Sprintf("=address=%s", binding.Address),
		fmt.Sprintf("=mac-address=%s", binding.MACAddress),
		fmt.Sprintf("=server=%s", binding.Server),
		fmt.Sprintf("=type=%s", bindingType),
		fmt.Sprintf("=to-address=%s", binding.ToAddress),
		fmt.Sprintf("=comment=%s", binding.Comment),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create static binding on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "create",
		"router_id": routerID,
		"response":  reply,
	}).Info("Hotspot IP binding created on router")

	binding.RouterID = routerID
	return binding, s.repo.Create(ctx, binding)
}

func (s *StaticService) UpdateBinding(ctx context.Context, binding *StaticBinding) error {
	existing, err := s.repo.FindByID(ctx, binding.ID)
	if err != nil {
		return fmt.Errorf("failed to find static binding: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, existing.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot update static binding on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(existing.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(existing.RouterID, conn)

	rosID, err := findRouterOSBindingID(conn, existing.MACAddress)
	if err != nil {
		return fmt.Errorf("failed to find RouterOS binding ID: %w", err)
	}

	reply, err := conn.Run("/ip/hotspot/ip-binding/set",
		fmt.Sprintf("=.id=%s", rosID),
		fmt.Sprintf("=address=%s", binding.Address),
		fmt.Sprintf("=mac-address=%s", binding.MACAddress),
		fmt.Sprintf("=server=%s", binding.Server),
		fmt.Sprintf("=type=%s", binding.Type),
		fmt.Sprintf("=to-address=%s", binding.ToAddress),
		fmt.Sprintf("=comment=%s", binding.Comment),
	)
	if err != nil {
		return fmt.Errorf("failed to update static binding on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "update",
		"id":        binding.ID,
		"router_id": existing.RouterID,
		"response":  reply,
	}).Info("Hotspot IP binding updated on router")

	binding.RouterID = existing.RouterID
	return s.repo.Update(ctx, binding)
}

func (s *StaticService) BlockBinding(ctx context.Context, id int) error {
	binding, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find static binding: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, binding.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot modify static binding on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(binding.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(binding.RouterID, conn)

	// Find host by MAC address and set authorized=no
	reply, err := conn.Run("/ip/hotspot/host/set",
		fmt.Sprintf("?mac-address=%s", binding.MACAddress),
		"=authorized=no",
	)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_service",
			"action":    "block",
			"mac":       binding.MACAddress,
			"error":     err.Error(),
		}).Warn("Failed to set host authorized=no, host may not exist yet")
		// Continue even if host not found - firewall block will still work
	}

	// Add to firewall isolir list for immediate traffic drop
	if binding.Address != "" {
		if addErr := addToIsolirList(conn, binding.Address); addErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "static_service",
				"action":    "block",
				"address":   binding.Address,
			}).WithError(addErr).Warn("Failed to add to isolir address-list during block")
		} else {
			// Ensure firewall rules exist
			if fwErr := ensureIsolirFirewallRules(conn, ""); fwErr != nil {
				logger.Log.WithFields(logrus.Fields{
					"component": "static_service",
					"action":    "block",
					"address":   binding.Address,
				}).WithError(fwErr).Warn("Failed to ensure isolir firewall rules during block")
			}
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "block",
		"id":        id,
		"router_id": binding.RouterID,
		"mac":       binding.MACAddress,
		"response":  reply,
	}).Info("Hotspot host blocked (authorized=no) on router")

	return s.repo.Block(ctx, id)
}

func (s *StaticService) UnblockBinding(ctx context.Context, id int) error {
	binding, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find static binding: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, binding.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot modify static binding on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(binding.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(binding.RouterID, conn)

	// Find host by MAC address and set authorized=yes
	reply, err := conn.Run("/ip/hotspot/host/set",
		fmt.Sprintf("?mac-address=%s", binding.MACAddress),
		"=authorized=yes",
	)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "static_service",
			"action":    "unblock",
			"mac":       binding.MACAddress,
			"error":     err.Error(),
		}).Warn("Failed to set host authorized=yes")
		// Continue even if failed - remove firewall block is priority
	}

	// Remove from firewall isolir list
	if binding.Address != "" {
		if removeErr := removeFromIsolirList(conn, binding.Address); removeErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "static_service",
				"action":    "unblock",
				"address":   binding.Address,
			}).WithError(removeErr).Warn("Failed to remove from isolir address-list during unblock")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "unblock",
		"id":        id,
		"router_id": binding.RouterID,
		"mac":       binding.MACAddress,
		"response":  reply,
	}).Info("Hotspot host unblocked (authorized=yes) on router")

	return s.repo.Unblock(ctx, id)
}

func (s *StaticService) DeleteBinding(ctx context.Context, id int) error {
	binding, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find static binding: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, binding.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot delete static binding on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(binding.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(binding.RouterID, conn)

	rosID, err := findRouterOSBindingID(conn, binding.MACAddress)
	if err != nil {
		return fmt.Errorf("failed to find RouterOS binding ID: %w", err)
	}

	reply, err := conn.Run("/ip/hotspot/ip-binding/remove",
		fmt.Sprintf("=.id=%s", rosID),
	)
	if err != nil {
		return fmt.Errorf("failed to delete static binding on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "delete",
		"id":        id,
		"router_id": binding.RouterID,
		"response":  reply,
	}).Info("Hotspot IP binding deleted on router")

	return s.repo.Delete(ctx, id)
}

func (s *StaticService) SyncFromRouter(ctx context.Context, routerID int) ([]StaticBinding, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return nil, fmt.Errorf("router is not active")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/hotspot/ip-binding/print")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch IP bindings from router %d: %w", routerID, err)
	}

	var synced []StaticBinding
	for _, re := range reply.Re {
		b := StaticBinding{
			RouterID:   routerID,
			Address:    re.Map["address"],
			MACAddress: re.Map["mac-address"],
			Server:     re.Map["server"],
			Type:       re.Map["type"],
			ToAddress:  re.Map["to-address"],
			Comment:    re.Map["comment"],
			IsDisabled: re.Map["disabled"] == "true",
			LastSeen:   re.Map["last-seen"],
		}
		if b.Type == "" {
			b.Type = "regular"
		}

		if err := s.repo.Upsert(ctx, &b); err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "static_service",
				"action":    "sync_upsert",
				"mac":       b.MACAddress,
			}).WithError(err).Warn("Failed to upsert binding during sync")
		} else {
			synced = append(synced, b)
		}
	}

	return synced, nil
}

func (s *StaticService) GetHotspotServers(ctx context.Context, routerID int) ([]HotspotServer, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return nil, fmt.Errorf("router is not active")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/hotspot/print",
		"=.proplist=name,interface,profile,address-pool,addresses-per-mac")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch hotspot servers: %w", err)
	}

	var servers []HotspotServer
	for _, re := range reply.Re {
		servers = append(servers, HotspotServer{
			Name:        re.Map["name"],
			Interface:   re.Map["interface"],
			Profile:     re.Map["profile"],
			AddressPool: re.Map["address-pool"],
		})
	}
	return servers, nil
}

func (s *StaticService) CreateHotspotServer(ctx context.Context, routerID int, server *HotspotServer) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("router is not active")
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	// Build the command parameters
	cmdArgs := []string{
		"/ip/hotspot/add",
		fmt.Sprintf("=name=%s", server.Name),
		fmt.Sprintf("=interface=%s", server.Interface),
		fmt.Sprintf("=profile=%s", server.Profile),
	}

	if server.AddressPool != "" {
		cmdArgs = append(cmdArgs, fmt.Sprintf("=address-pool=%s", server.AddressPool))
	}

	reply, err := conn.Run(cmdArgs...)
	if err != nil {
		return fmt.Errorf("failed to create hotspot server on router %d: %w", routerID, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "static_service",
		"action":    "create_hotspot_server",
		"name":      server.Name,
		"router_id": routerID,
		"response":  reply,
	}).Info("Hotspot server created on router")

	return nil
}

// findRouterOSBindingID queries /ip/hotspot/ip-binding to get RouterOS internal .id by MAC address
func findRouterOSBindingID(conn interface{ Run(...string) (*routeros.Reply, error) }, mac string) (string, error) {
	reply, err := conn.Run("/ip/hotspot/ip-binding/print",
		fmt.Sprintf("?mac-address=%s", mac),
		"=.proplist=.id")
	if err != nil {
		return "", fmt.Errorf("failed to query ip-binding by mac %s: %w", mac, err)
	}
	if len(reply.Re) == 0 {
		return "", fmt.Errorf("ip-binding with mac %s not found on router", mac)
	}
	id := reply.Re[0].Map[".id"]
	if id == "" {
		return "", fmt.Errorf("ip-binding with mac %s returned empty .id", mac)
	}
	return id, nil
}

// addToIsolirList adds ip to firewall address-list "isolir" (idempotent)
func addToIsolirList(conn interface{ Run(...string) (*routeros.Reply, error) }, ip string) error {
	if ip == "" {
		return nil
	}
	reply, err := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir",
		fmt.Sprintf("?address=%s", ip),
		"=.proplist=.id")
	if err != nil {
		return fmt.Errorf("failed to check isolir address-list: %w", err)
	}
	if len(reply.Re) > 0 {
		return nil // already present
	}
	_, err = conn.Run("/ip/firewall/address-list/add",
		"=list=isolir",
		fmt.Sprintf("=address=%s", ip),
		"=comment=isolir-client",
		"=disabled=no")
	return err
}

// removeFromIsolirList removes all entries for ip from firewall address-list "isolir"
func removeFromIsolirList(conn interface{ Run(...string) (*routeros.Reply, error) }, ip string) error {
	if ip == "" {
		return nil
	}
	reply, err := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir",
		fmt.Sprintf("?address=%s", ip),
		"=.proplist=.id")
	if err != nil {
		return fmt.Errorf("failed to query isolir address-list: %w", err)
	}
	for _, re := range reply.Re {
		if entryID := re.Map[".id"]; entryID != "" {
			conn.Run("/ip/firewall/address-list/remove",
				fmt.Sprintf("=.id=%s", entryID))
		}
	}
	return nil
}

// ensureIsolirFirewallRules ensures forward chain has drop rule for isolir list
func ensureIsolirFirewallRules(conn interface{ Run(...string) (*routeros.Reply, error) }, gateway string) error {
	// Check for existing drop rule
	dropReply, _ := conn.Run("/ip/firewall/filter/print",
		"?chain=forward",
		"?src-address-list=isolir",
		"?action=drop",
		"=.proplist=.id")

	dropID := ""
	if len(dropReply.Re) > 0 {
		dropID = dropReply.Re[0].Map[".id"]
	}

	// Create drop rule if not exists
	if dropID == "" {
		if _, err := conn.Run("/ip/firewall/filter/add",
			"=chain=forward",
			"=src-address-list=isolir",
			"=action=drop",
			"=comment=isolir drop all",
			"=disabled=no"); err != nil {
			return fmt.Errorf("failed to add isolir drop-all rule: %w", err)
		}
	}

	// Add accept rule for gateway if specified
	if gateway != "" {
		acceptReply, _ := conn.Run("/ip/firewall/filter/print",
			"?chain=forward",
			"?src-address-list=isolir",
			fmt.Sprintf("?dst-address=%s", gateway),
			"?action=accept",
			"=.proplist=.id")

		if len(acceptReply.Re) == 0 {
			args := []string{
				"/ip/firewall/filter/add",
				"=chain=forward",
				"=src-address-list=isolir",
				fmt.Sprintf("=dst-address=%s", gateway),
				"=action=accept",
				"=comment=isolir allow gateway",
				"=disabled=no",
			}
			if dropID != "" {
				args = append(args, fmt.Sprintf("=place-before=%s", dropID))
			}
			if _, err := conn.Run(args...); err != nil {
				return fmt.Errorf("failed to add isolir accept-gateway rule: %w", err)
			}
		}
	}

	return nil
}
