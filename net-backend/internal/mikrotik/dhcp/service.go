package dhcp

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"

	"github.com/go-routeros/routeros"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type IDHCPService interface {
	GetAllLeases(ctx context.Context, routerID int) ([]DHCPLease, error)
	GetLeaseByID(ctx context.Context, id int) (*DHCPLease, error)
	GetServers(ctx context.Context, routerID int) ([]DHCPServer, error)
	GetIPPools(ctx context.Context, routerID int) ([]string, error)
	CreateIPPool(ctx context.Context, routerID int, name, ranges, nextPool string) error
	CreateServer(ctx context.Context, routerID int, server *DHCPServer) error
	CreateLease(ctx context.Context, lease *DHCPLease, routerID int) (*DHCPLease, error)
	UpdateLease(ctx context.Context, lease *DHCPLease) error
	SyncFromMikrotik(ctx context.Context, routerID int) ([]DHCPLease, error)
	// DisableLease isolates a client via firewall address-list (not disabled=yes).
	DisableLease(ctx context.Context, id int) error
	// EnableLease removes isolation (removes from firewall address-list and clears block-access).
	EnableLease(ctx context.Context, id int) error
	// BlockLease blocks DHCP renewal via block-access=yes and adds to firewall isolir list.
	BlockLease(ctx context.Context, id int) error
	MakeStaticLease(ctx context.Context, id int) error
	MakeDynamicLease(ctx context.Context, id int) error
	DeleteLease(ctx context.Context, id int) error
}

type DHCPService struct {
	repo           IDHCPLeaseRepository
	routerRepo     mikrotik.RouterRepository
	connectionPool *mikrotik.ConnectionPool
}

func NewDHCPService(
	repo IDHCPLeaseRepository,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
) IDHCPService {
	return &DHCPService{
		repo:           repo,
		routerRepo:     routerRepo,
		connectionPool: connectionPool,
	}
}


func (s *DHCPService) fetchMikrotikID(ctx context.Context, routerID int, address string) (string, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return "", fmt.Errorf("failed to find router: %w", err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return "", fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/dhcp-server/lease/print",
		fmt.Sprintf("?address=%s", address),
		"=.proplist=.id,address")
	if err != nil {
		return "", fmt.Errorf("failed to fetch DHCP lease from MikroTik: %w", err)
	}

	for _, re := range reply.Re {
		if re.Map["address"] == address {
			return re.Map[".id"], nil
		}
	}

	return "", errors.New("mikrotik item not found")
}

func isMikrotikNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "no such item") ||
		strings.Contains(errStr, "not found") ||
		strings.Contains(errStr, "no such command") ||
		strings.Contains(errStr, "ambiguous value")
}

func (s *DHCPService) GetAllLeases(ctx context.Context, routerID int) ([]DHCPLease, error) {
	return s.repo.FindAll(ctx, routerID)
}

func (s *DHCPService) SyncFromMikrotik(ctx context.Context, routerID int) ([]DHCPLease, error) {
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

	reply, err := conn.Run("/ip/dhcp-server/lease/print")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP leases from router %d: %w", routerID, err)
	}

	// Build isolir IP set from firewall address-list
	isolirIPs := make(map[string]bool)
	if alReply, alErr := conn.Run("/ip/firewall/address-list/print",
		"?list=isolir", "=.proplist=address"); alErr == nil {
		for _, re := range alReply.Re {
			if addr := re.Map["address"]; addr != "" {
				isolirIPs[addr] = true
			}
		}
	}

	var synced []DHCPLease
	var seenMACs []string
	for _, re := range reply.Re {
		m := re.Map
		lease := &DHCPLease{
			RouterID:      routerID,
			Address:       m["address"],
			MACAddress:    m["mac-address"],
			HostName:      m["host-name"],
			ClientID:      m["client-id"],
			Server:        m["server"],
			Status:        m["status"],
			ExpiresAfter:  m["expires-after"],
			Dynamic:       m["dynamic"] == "true",
			IsIsolir:      isolirIPs[m["address"]] || m["block-access"] == "true",
			ActiveAddress: m["active-address"],
			ActiveMAC:     m["active-mac"],
			ActiveServer:  m["active-server"],
			ActiveState:   m["status"] == "bound",
			LastSeen:      m["last-seen"],
			Comment:       m["comment"],
		}
		if lease.MACAddress == "" {
			continue
		}
		seenMACs = append(seenMACs, lease.MACAddress)
		if err := s.repo.Upsert(ctx, lease); err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component":   "dhcp_service",
				"action":      "sync",
				"mac_address": lease.MACAddress,
				"router_id":   routerID,
			}).WithError(err).Warn("Failed to upsert DHCP lease during sync")
			continue
		}
		synced = append(synced, *lease)
	}

	// Remove stale dynamic leases that no longer exist on this router
	if len(seenMACs) > 0 {
		if err := s.repo.DeleteStaleByRouter(ctx, routerID, seenMACs); err != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "dhcp_service",
				"action":    "sync",
				"router_id": routerID,
			}).WithError(err).Warn("Failed to delete stale DHCP leases during sync")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "sync",
		"router_id": routerID,
		"count":     len(synced),
	}).Info("DHCP leases synced from router")

	return synced, nil
}

func (s *DHCPService) GetServers(ctx context.Context, routerID int) ([]DHCPServer, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/dhcp-server/print")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP servers from router %d: %w", routerID, err)
	}

	var servers []DHCPServer
	for _, re := range reply.Re {
		servers = append(servers, DHCPServer{
			Name:        re.Map["name"],
			Interface:   re.Map["interface"],
			AddressPool: re.Map["address-pool"],
			LeaseTime:   re.Map["lease-time"],
		})
	}
	return servers, nil
}

func (s *DHCPService) GetIPPools(ctx context.Context, routerID int) ([]string, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/pool/print", "=.proplist=name")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch IP pools from router %d: %w", routerID, err)
	}

	var pools []string
	for _, re := range reply.Re {
		if name := re.Map["name"]; name != "" {
			pools = append(pools, name)
		}
	}
	return pools, nil
}

func (s *DHCPService) CreateIPPool(ctx context.Context, routerID int, name, ranges, nextPool string) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	args := []string{
		"/ip/pool/add",
		fmt.Sprintf("=name=%s", name),
		fmt.Sprintf("=ranges=%s", ranges),
	}
	if nextPool != "" {
		args = append(args, fmt.Sprintf("=next-pool=%s", nextPool))
	}

	_, err = conn.Run(args...)
	if err != nil {
		return fmt.Errorf("failed to create IP pool on router %d: from RouterOS device: %w", routerID, err)
	}

	return nil
}

func (s *DHCPService) GetLeaseByID(ctx context.Context, id int) (*DHCPLease, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *DHCPService) CreateLease(ctx context.Context, lease *DHCPLease, routerID int) (*DHCPLease, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return nil, fmt.Errorf("cannot create DHCP lease on inactive router")
	}

	// Check if lease with this MAC already exists (upsert behavior)
	existingLease, _ := s.repo.FindByMAC(ctx, routerID, lease.MACAddress)
	if existingLease != nil {
		// Update existing lease instead of creating new
		lease.ID = existingLease.ID
		lease.RouterID = routerID
		lease.Dynamic = existingLease.Dynamic
		
		// Update on MikroTik first
		conn, err := s.connectionPool.GetConnection(routerID, router)
		if err != nil {
			return nil, fmt.Errorf("failed to get connection: %w", err)
		}
		defer s.connectionPool.ReturnConnection(routerID, conn)

		mikrotikID, err := s.fetchMikrotikID(ctx, routerID, existingLease.Address)
		if err == nil && mikrotikID != "" {
			conn.Run("/ip/dhcp-server/lease/set",
				fmt.Sprintf("=.id=%s", mikrotikID),
				fmt.Sprintf("=address=%s", lease.Address),
				fmt.Sprintf("=mac-address=%s", lease.MACAddress),
				fmt.Sprintf("=comment=%s", lease.Comment),
			)
		}
		
		// Update in database using Upsert
		if err := s.repo.Upsert(ctx, lease); err != nil {
			return nil, fmt.Errorf("failed to update existing DHCP lease: %w", err)
		}
		
		logger.Log.WithFields(logrus.Fields{
			"component":   "dhcp_service",
			"action":      "upsert",
			"address":     lease.Address,
			"mac_address": lease.MACAddress,
			"router_id":   routerID,
		}).Info("DHCP lease updated (MAC already exists)")
		
		return lease, nil
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/dhcp-server/lease/add",
		fmt.Sprintf("=address=%s", lease.Address),
		fmt.Sprintf("=mac-address=%s", lease.MACAddress),
		fmt.Sprintf("=client-id=%s", lease.ClientID),
		fmt.Sprintf("=server=%s", lease.Server),
		fmt.Sprintf("=comment=%s", lease.Comment),
		fmt.Sprintf("=disabled=%v", lease.IsIsolir),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create DHCP lease on router %d: %w", routerID, err)
	}

	lease.RouterID = routerID
	lease.Dynamic = false
	
	// Use Upsert to avoid race conditions
	if err := s.repo.Upsert(ctx, lease); err != nil {
		return nil, fmt.Errorf("failed to save DHCP lease: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "dhcp_service",
		"action":      "create",
		"address":     lease.Address,
		"mac_address": lease.MACAddress,
		"router_id":   routerID,
		"response":    reply,
	}).Info("DHCP lease created on router")

	return lease, nil
}

func (s *DHCPService) UpdateLease(ctx context.Context, lease *DHCPLease) error {
	existingLease, err := s.repo.FindByID(ctx, lease.ID)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, existingLease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot update DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(existingLease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(existingLease.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, existingLease.RouterID, existingLease.Address)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			return fmt.Errorf("DHCP lease not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	reply, err := conn.Run("/ip/dhcp-server/lease/set",
		fmt.Sprintf("=.id=%s", mikrotikID),
		fmt.Sprintf("=address=%s", lease.Address),
		fmt.Sprintf("=mac-address=%s", lease.MACAddress),
		fmt.Sprintf("=client-id=%s", lease.ClientID),
		fmt.Sprintf("=server=%s", lease.Server),
		fmt.Sprintf("=comment=%s", lease.Comment),
		fmt.Sprintf("=disabled=%v", lease.IsIsolir),
	)
	if err != nil {
		return fmt.Errorf("failed to update DHCP lease on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "update",
		"address":   existingLease.Address,
		"router_id": existingLease.RouterID,
		"response":  reply,
	}).Info("DHCP lease updated on router")

	err = s.repo.Update(ctx, lease)
	if err != nil {
		return fmt.Errorf("failed to update DHCP lease: %w", err)
	}

	return nil
}

// DisableLease isolates a DHCP client via firewall address-list "isolir".
// The DHCP lease itself is NOT disabled — block-access and disabled flags are cleared.
func (s *DHCPService) DisableLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot isolir DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	// Add IP to firewall address-list "isolir" (idempotent)
	if err := addToIsolirList(conn, lease.Address); err != nil {
		return fmt.Errorf("failed to add to isolir address-list: %w", err)
	}

	// Ensure firewall filter rules exist (accept gateway + drop all from isolir)
	gateway := fetchGatewayForIP(conn, lease.Address)
	if fwErr := ensureIsolirFirewallRules(conn, gateway); fwErr != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_service",
			"action":    "isolir",
			"address":   lease.Address,
		}).WithError(fwErr).Warn("Failed to ensure isolir firewall rules")
	}

	// Ensure DHCP lease itself is not disabled and has no block-access
	if mikrotikID, fetchErr := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address); fetchErr == nil {
		conn.Run("/ip/dhcp-server/lease/set",
			fmt.Sprintf("=.id=%s", mikrotikID),
			"=disabled=no",
			"=block-access=no",
		)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "isolir",
		"address":   lease.Address,
		"router_id": lease.RouterID,
	}).Info("DHCP lease isolated via firewall on router")

	return s.repo.Disable(ctx, id)
}

// EnableLease removes firewall isolation and clears block-access from a DHCP lease.
func (s *DHCPService) EnableLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot enable DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	// Remove IP from firewall address-list "isolir"
	if err := removeFromIsolirList(conn, lease.Address); err != nil {
		return fmt.Errorf("failed to remove from isolir address-list: %w", err)
	}

	// Clear block-access and ensure lease is enabled
	if mikrotikID, fetchErr := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address); fetchErr == nil {
		conn.Run("/ip/dhcp-server/lease/set",
			fmt.Sprintf("=.id=%s", mikrotikID),
			"=block-access=no",
			"=disabled=no",
		)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "un_isolir",
		"address":   lease.Address,
		"router_id": lease.RouterID,
	}).Info("DHCP lease isolation removed on router")

	return s.repo.Enable(ctx, id)
}

// BlockLease blocks DHCP renewal via block-access=yes and adds to firewall isolir list
// for immediate traffic drop. Does NOT set disabled=yes.
func (s *DHCPService) BlockLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot block DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			return fmt.Errorf("DHCP lease not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	// Set block-access=yes, keep disabled=no
	reply, err := conn.Run("/ip/dhcp-server/lease/set",
		fmt.Sprintf("=.id=%s", mikrotikID),
		"=block-access=yes",
		"=disabled=no",
	)
	if err != nil {
		return fmt.Errorf("failed to set block-access on DHCP lease: %w", err)
	}

	// Also add to isolir firewall list for immediate traffic drop
	if addErr := addToIsolirList(conn, lease.Address); addErr != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "dhcp_service",
			"action":    "block",
			"address":   lease.Address,
		}).WithError(addErr).Warn("Failed to add to isolir address-list during block")
	} else {
		gateway := fetchGatewayForIP(conn, lease.Address)
		if fwErr := ensureIsolirFirewallRules(conn, gateway); fwErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "dhcp_service",
				"action":    "block",
				"address":   lease.Address,
			}).WithError(fwErr).Warn("Failed to ensure isolir firewall rules during block")
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "block",
		"address":   lease.Address,
		"router_id": lease.RouterID,
		"response":  reply,
	}).Info("DHCP lease blocked (block-access=yes) on router")

	return s.repo.Block(ctx, id)
}

func (s *DHCPService) MakeStaticLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot modify DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			return fmt.Errorf("DHCP lease not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	reply, err := conn.Run("/ip/dhcp-server/lease/make-static", fmt.Sprintf("=.id=%s", mikrotikID))
	if err != nil {
		return fmt.Errorf("failed to make DHCP lease static: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "make_static",
		"address":   lease.Address,
		"router_id": lease.RouterID,
		"response":  reply,
	}).Info("DHCP lease made static on router")

	err = s.repo.MakeStatic(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to make DHCP lease static: %w", err)
	}

	return nil
}

func (s *DHCPService) MakeDynamicLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot modify DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			return fmt.Errorf("DHCP lease not found on MikroTik: %w", err)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	// Remove the static lease to make it dynamic again
	// Note: MikroTik doesn't have a "make-dynamic" command, we must remove the static lease
	reply, err := conn.Run("/ip/dhcp-server/lease/remove", fmt.Sprintf("=.id=%s", mikrotikID))
	if err != nil {
		return fmt.Errorf("failed to remove static DHCP lease: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "make_dynamic",
		"address":   lease.Address,
		"router_id": lease.RouterID,
		"response":  reply,
	}).Info("Static DHCP lease removed (will become dynamic on next request)")

	err = s.repo.MakeDynamic(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to make DHCP lease dynamic: %w", err)
	}

	return nil
}

func (s *DHCPService) DeleteLease(ctx context.Context, id int) error {
	lease, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to find DHCP lease: %w", err)
	}

	router, err := s.routerRepo.FindById(ctx, lease.RouterID)
	if err != nil {
		return fmt.Errorf("failed to find router: %w", err)
	}

	if !router.IsActive {
		return fmt.Errorf("cannot delete DHCP lease on inactive router")
	}

	conn, err := s.connectionPool.GetConnection(lease.RouterID, router)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	defer s.connectionPool.ReturnConnection(lease.RouterID, conn)

	mikrotikID, err := s.fetchMikrotikID(ctx, lease.RouterID, lease.Address)
	if err != nil {
		if isMikrotikNotFoundError(err) {
			logger.Log.WithFields(logrus.Fields{
				"component": "dhcp_service",
				"action":    "delete",
				"address":   lease.Address,
				"router_id": lease.RouterID,
			}).Warn("DHCP lease not found on MikroTik during delete, removing from database")
			return s.repo.Delete(ctx, id)
		}
		return fmt.Errorf("failed to fetch MikroTik ID: %w", err)
	}

	reply, err := conn.Run("/ip/dhcp-server/lease/remove", fmt.Sprintf("=.id=%s", mikrotikID))
	if err != nil {
		return fmt.Errorf("failed to delete DHCP lease on router: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "delete",
		"address":   lease.Address,
		"router_id": lease.RouterID,
		"response":  reply,
	}).Info("DHCP lease deleted on router")

	err = s.repo.Delete(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to delete DHCP lease: %w", err)
	}

	return nil
}

func (s *DHCPService) CreateServer(ctx context.Context, routerID int, server *DHCPServer) error {
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

	cmdArgs := []string{
		"/ip/dhcp-server/add",
		fmt.Sprintf("=name=%s", server.Name),
		fmt.Sprintf("=interface=%s", server.Interface),
	}

	if server.AddressPool != "" {
		cmdArgs = append(cmdArgs, fmt.Sprintf("=address-pool=%s", server.AddressPool))
	}
	if server.LeaseTime != "" {
		cmdArgs = append(cmdArgs, fmt.Sprintf("=lease-time=%s", server.LeaseTime))
	}

	reply, err := conn.Run(cmdArgs...)
	if err != nil {
		return fmt.Errorf("failed to create dhcp server on router %d: %w", routerID, err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "dhcp_service",
		"action":    "create_server",
		"name":      server.Name,
		"router_id": routerID,
		"response":  reply,
	}).Info("DHCP server created on router")

	return nil
}

// ── Firewall isolir helpers ────────────────────────────────────────────────────

// fetchGatewayForIP finds the gateway for the DHCP network that contains ip
// by querying /ip/dhcp-server/network on the router.
func fetchGatewayForIP(conn *routeros.Client, ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}
	reply, err := conn.Run("/ip/dhcp-server/network/print", "=.proplist=address,gateway")
	if err != nil {
		return ""
	}
	for _, re := range reply.Re {
		_, network, err := net.ParseCIDR(re.Map["address"])
		if err != nil || !network.Contains(parsed) {
			continue
		}
		return re.Map["gateway"]
	}
	return ""
}

// addToIsolirList adds ip to firewall address-list "isolir" (idempotent).
func addToIsolirList(conn *routeros.Client, ip string) error {
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

// removeFromIsolirList removes all entries for ip from firewall address-list "isolir".
func removeFromIsolirList(conn *routeros.Client, ip string) error {
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

// ensureIsolirFirewallRules ensures forward chain has:
//  1. accept rule for isolir → gateway (placed before drop)
//  2. drop rule for isolir → anywhere
//
// Both rules are created idempotently (skipped if already present).
func ensureIsolirFirewallRules(conn *routeros.Client, gateway string) error {
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

	// Add accept-gateway rule if gateway is known and rule doesn't exist yet
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

	// Add drop rule if not exists
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

	return nil
}
