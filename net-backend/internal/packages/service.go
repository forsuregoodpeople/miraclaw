package packages

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/internal/mikrotik/pppoe"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type IPackageService interface {
	GetAll(ctx context.Context, routerID *int, connectionType string, mitraID *int) ([]PackageWithSyncStatus, error)
	GetByID(ctx context.Context, id int) (*Package, error)
	GetByRouterAndType(ctx context.Context, routerID int, connectionType string) ([]Package, error)
	Create(ctx context.Context, req CreatePackageRequest) (*Package, error)
	Update(ctx context.Context, id int, req UpdatePackageRequest) (*Package, error)
	SyncProfiles(ctx context.Context, routerID int) (ProfileSyncResult, error)
	UpdateLabel(ctx context.Context, id int, req UpdateLabelRequest) (*Package, error)
	Delete(ctx context.Context, id int) error
	AssignToCustomer(ctx context.Context, packageID int, customerID int) error
	UnassignFromCustomer(ctx context.Context, customerID int) error

	CheckSync(ctx context.Context, routerID int) (SyncCheckResult, error)

	GetSyncLogs(ctx context.Context, packageID int, limit int) ([]SyncLog, error)
}

type service struct {
	repo           IPackageRepository
	db             *sql.DB
	routerRepo     mikrotik.RouterRepository
	connectionPool *mikrotik.ConnectionPool
	pppoeService   pppoe.Service
}

func NewService(
	repo IPackageRepository,
	db *sql.DB,
	routerRepo mikrotik.RouterRepository,
	connectionPool *mikrotik.ConnectionPool,
	pppoeService pppoe.Service,
) IPackageService {
	return &service{
		repo:           repo,
		db:             db,
		routerRepo:     routerRepo,
		connectionPool: connectionPool,
		pppoeService:   pppoeService,
	}
}

func (s *service) GetAll(ctx context.Context, routerID *int, connectionType string, mitraID *int) ([]PackageWithSyncStatus, error) {
	return s.repo.GetAll(ctx, routerID, connectionType, mitraID)
}

func (s *service) GetByID(ctx context.Context, id int) (*Package, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) GetByRouterAndType(ctx context.Context, routerID int, connectionType string) ([]Package, error) {
	return s.repo.GetByRouterAndType(ctx, routerID, connectionType)
}

// SyncProfiles is the core of the new design.
// It fetches all profiles from MikroTik for the given router, upserts them as
// auto-source packages, and marks packages whose profiles have been removed on
// MikroTik as inactive.
//
// Failure strategy:
//   - If a connection type fetch fails, we skip deactivation for that type
//     (conservative: don't delete data when we're not sure about the truth).
//   - Partial results are still upserted.
//   - All errors are logged but only a fatal "cannot reach router" blocks the run.
func (s *service) SyncProfiles(ctx context.Context, routerID int) (ProfileSyncResult, error) {
	now := time.Now().UTC()
	result := ProfileSyncResult{RouterID: routerID, SyncedAt: now.Format(time.RFC3339)}

	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return result, fmt.Errorf("router %d not found: %w", routerID, err)
	}
	if !router.IsActive {
		return result, fmt.Errorf("router %d is inactive", routerID)
	}

	// ── PPPoE profiles ────────────────────────────────────────────────────────
	pppoeNames, pppoeErr := s.fetchPPPoEProfileNames(ctx, routerID)
	if pppoeErr != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "package_sync",
			"router_id": routerID,
		}).WithError(pppoeErr).Warn("Failed to fetch PPPoE profiles; skipping PPPoE sync for this router")
	} else {
		cr, up, err := s.upsertProfiles(ctx, routerID, "PPPOE", pppoeNames, now)
		if err != nil {
			logger.Log.WithError(err).Warn("PPPoE upsert partial failure")
		}
		result.Created += cr
		result.Updated += up
		result.Total += len(pppoeNames)

		// Only deactivate if fetch succeeded (non-empty list is a good signal).
		if len(pppoeNames) > 0 {
			inactive, _ := s.repo.DeactivateMissing(ctx, routerID, "PPPOE", pppoeNames, now)
			result.Inactive += inactive
		}
	}

	// ── DHCP servers (used as profiles for DHCP customers) ───────────────────
	dhcpNames, dhcpErr := s.fetchDHCPServerNames(ctx, routerID)
	if dhcpErr != nil {
		logger.Log.WithFields(logrus.Fields{
			"component": "package_sync",
			"router_id": routerID,
		}).WithError(dhcpErr).Warn("Failed to fetch DHCP servers; skipping DHCP sync")
	} else {
		cr, up, err := s.upsertProfiles(ctx, routerID, "DHCP", dhcpNames, now)
		if err != nil {
			logger.Log.WithError(err).Warn("DHCP upsert partial failure")
		}
		result.Created += cr
		result.Updated += up
		result.Total += len(dhcpNames)

		if len(dhcpNames) > 0 {
			inactive, _ := s.repo.DeactivateMissing(ctx, routerID, "DHCP", dhcpNames, now)
			result.Inactive += inactive
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component": "package_sync",
		"router_id": routerID,
		"created":   result.Created,
		"updated":   result.Updated,
		"inactive":  result.Inactive,
		"total":     result.Total,
	}).Info("Profile sync completed")

	return result, nil
}

// upsertProfiles calls UpsertFromProfile for each name and tallies created/updated counts.
func (s *service) upsertProfiles(ctx context.Context, routerID int, connType string, names []string, now time.Time) (created, updated int, err error) {
	for _, name := range names {
		isNew, upsertErr := s.repo.UpsertFromProfile(ctx, routerID, connType, name, now)
		if upsertErr != nil {
			logger.Log.WithFields(logrus.Fields{
				"component": "package_sync",
				"router_id": routerID,
				"conn_type": connType,
				"profile":   name,
			}).WithError(upsertErr).Warn("Upsert failed for profile")
			err = upsertErr // keep going, record last error
			continue
		}
		if isNew {
			created++
		} else {
			updated++
		}
	}
	return
}

func (s *service) Create(ctx context.Context, req CreatePackageRequest) (*Package, error) {
	return s.repo.Create(ctx, req)
}

func (s *service) Update(ctx context.Context, id int, req UpdatePackageRequest) (*Package, error) {
	return s.repo.UpdateLabel(ctx, id, req)
}

func (s *service) UpdateLabel(ctx context.Context, id int, req UpdateLabelRequest) (*Package, error) {
	return s.repo.UpdateLabel(ctx, id, req)
}

func (s *service) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

// AssignToCustomer sets package_id on the customer row AND applies the MikroTik profile.
func (s *service) AssignToCustomer(ctx context.Context, packageID int, customerID int) error {
	pkg, err := s.repo.GetByID(ctx, packageID)
	if err != nil {
		return fmt.Errorf("package not found: %w", err)
	}

	var custType, mikrotikRef string
	var routerID int
	err = s.db.QueryRowContext(ctx,
		`SELECT type, COALESCE(mikrotik_ref,''), COALESCE(router_id,0) FROM customers WHERE id = $1`,
		customerID,
	).Scan(&custType, &mikrotikRef, &routerID)
	if err != nil {
		return fmt.Errorf("customer not found: %w", err)
	}

	if custType != pkg.ConnectionType {
		return fmt.Errorf("type mismatch: customer is %s but package is %s", custType, pkg.ConnectionType)
	}
	if mikrotikRef == "" {
		return fmt.Errorf("customer has no mikrotik_ref, cannot apply profile")
	}

	if err := s.applyProfile(ctx, routerID, custType, mikrotikRef, pkg.MikrotikProfileName); err != nil {
		return fmt.Errorf("apply profile on MikroTik: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`UPDATE customers SET package_id=$1, updated_at=NOW() WHERE id=$2`,
		packageID, customerID,
	)
	if err != nil {
		return fmt.Errorf("update customer package_id: %w", err)
	}

	logger.Log.WithFields(logrus.Fields{
		"component":   "package_service",
		"action":      "assign",
		"package_id":  packageID,
		"customer_id": customerID,
		"profile":     pkg.MikrotikProfileName,
	}).Info("Package assigned to customer")

	return nil
}

func (s *service) UnassignFromCustomer(ctx context.Context, customerID int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE customers SET package_id=NULL, updated_at=NOW() WHERE id=$1`,
		customerID,
	)
	if err != nil {
		return fmt.Errorf("unassign package: %w", err)
	}
	return nil
}

// CheckSync verifies that each stored package profile still exists on MikroTik.
// This is the drift-detection pass called by SyncValidator — it does NOT upsert.
func (s *service) CheckSync(ctx context.Context, routerID int) (SyncCheckResult, error) {
	pkgs, err := s.repo.GetByRouterAndType(ctx, routerID, "")
	if err != nil {
		return SyncCheckResult{}, fmt.Errorf("CheckSync fetch packages: %w", err)
	}

	var result SyncCheckResult
	result.Total = len(pkgs)

	// Fetch live profile lists once per type to avoid N MikroTik calls.
	pppoeNames, pppoeErr := s.fetchPPPoEProfileNames(ctx, routerID)
	dhcpNames, dhcpErr := s.fetchDHCPServerNames(ctx, routerID)

	for _, pkg := range pkgs {
		log := SyncLog{
			PackageID:   pkg.ID,
			CheckedAt:   time.Now(),
			StoredValue: pkg.MikrotikProfileName,
		}

		var exists bool
		switch pkg.ConnectionType {
		case "PPPOE":
			if pppoeErr != nil {
				// Can't determine — skip this package rather than falsely marking missing.
				continue
			}
			exists = containsString(pppoeNames, pkg.MikrotikProfileName)
		case "DHCP", "STATIC":
			if dhcpErr != nil {
				continue
			}
			exists = containsString(dhcpNames, pkg.MikrotikProfileName)
		default:
			continue
		}

		if exists {
			log.Status = "ok"
			log.MikrotikActual = pkg.MikrotikProfileName
			result.OK++
		} else {
			log.Status = "missing"
			result.Missing++
		}

		if writeErr := s.repo.WriteSyncLog(ctx, log); writeErr != nil {
			logger.Log.WithError(writeErr).Warn("Failed to write package sync log")
		}
	}

	return result, nil
}

func (s *service) GetSyncLogs(ctx context.Context, packageID int, limit int) ([]SyncLog, error) {
	return s.repo.GetSyncLogs(ctx, packageID, limit)
}

// ── private helpers ─────────────────────────────────────────────────────────

func (s *service) fetchPPPoEProfileNames(ctx context.Context, routerID int) ([]string, error) {
	profiles, err := s.pppoeService.GetProfiles(ctx, routerID)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(profiles))
	for _, p := range profiles {
		if strings.TrimSpace(p.Name) != "" {
			names = append(names, p.Name)
		}
	}
	return names, nil
}

func (s *service) fetchDHCPServerNames(ctx context.Context, routerID int) ([]string, error) {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return nil, fmt.Errorf("router not found: %w", err)
	}
	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return nil, fmt.Errorf("connection error: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	reply, err := conn.Run("/ip/dhcp-server/print", "=.proplist=name")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP servers: %w", err)
	}
	names := make([]string, 0, len(reply.Re))
	for _, re := range reply.Re {
		if n := strings.TrimSpace(re.Map["name"]); n != "" {
			names = append(names, n)
		}
	}
	return names, nil
}

// applyProfile pushes the profile/server assignment to MikroTik for a customer entry.
func (s *service) applyProfile(ctx context.Context, routerID int, connType, mikrotikRef, profileName string) error {
	router, err := s.routerRepo.FindById(ctx, routerID)
	if err != nil {
		return fmt.Errorf("router not found: %w", err)
	}
	if !router.IsActive {
		return fmt.Errorf("router %d is inactive", routerID)
	}

	conn, err := s.connectionPool.GetConnection(routerID, router)
	if err != nil {
		return fmt.Errorf("connection error: %w", err)
	}
	defer s.connectionPool.ReturnConnection(routerID, conn)

	switch connType {
	case "PPPOE":
		_, err = conn.Run("/ppp/secret/set",
			fmt.Sprintf("=.id=%s", mikrotikRef),
			fmt.Sprintf("=profile=%s", profileName),
		)
	case "DHCP":
		_, err = conn.Run("/ip/dhcp-server/lease/set",
			fmt.Sprintf("=.id=%s", mikrotikRef),
			fmt.Sprintf("=server=%s", profileName),
		)
	case "STATIC":
		_, err = conn.Run("/ip/hotspot/ip-binding/set",
			fmt.Sprintf("=.id=%s", mikrotikRef),
			fmt.Sprintf("=server=%s", profileName),
		)
	default:
		return fmt.Errorf("unsupported connection type: %s", connType)
	}

	if err != nil {
		return fmt.Errorf("applyProfile MikroTik (%s): %w", connType, err)
	}
	return nil
}

func containsString(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}
