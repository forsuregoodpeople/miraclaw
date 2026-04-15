package packages

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type IPackageRepository interface {
	GetAll(ctx context.Context, routerID *int, connectionType string, mitraID *int) ([]PackageWithSyncStatus, error)
	GetByID(ctx context.Context, id int) (*Package, error)
	GetByRouterAndType(ctx context.Context, routerID int, connectionType string) ([]Package, error)

	// UpsertFromProfile inserts a new auto-synced package or re-activates / updates an existing one.
	// Returns (isNew, error).
	UpsertFromProfile(ctx context.Context, routerID int, connType, profileName string, syncedAt time.Time) (bool, error)

	// DeactivateMissing marks all auto-synced packages for a router+type that are NOT in keepNames
	// as inactive. Returns the count of rows deactivated.
	DeactivateMissing(ctx context.Context, routerID int, connType string, keepNames []string, syncedAt time.Time) (int, error)

	// UpdateLabel updates only the display name and description (admin-editable fields).
	UpdateLabel(ctx context.Context, id int, req UpdateLabelRequest) (*Package, error)

	Delete(ctx context.Context, id int) error
	WriteSyncLog(ctx context.Context, log SyncLog) error
	GetSyncLogs(ctx context.Context, packageID int, limit int) ([]SyncLog, error)

	// Legacy — kept for the manual-create path.
	Create(ctx context.Context, req CreatePackageRequest) (*Package, error)
}

type repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) IPackageRepository {
	return &repository{db: db}
}

// selectCols includes the new source and last_synced_at columns.
const selectCols = `
	id, name, COALESCE(description,''), connection_type, router_id,
	mikrotik_profile_name, COALESCE(source,'manual'), is_active, last_synced_at,
	created_at, updated_at`

func scanPackage(s interface{ Scan(...any) error }, p *Package) error {
	return s.Scan(
		&p.ID, &p.Name, &p.Description, &p.ConnectionType, &p.RouterID,
		&p.MikrotikProfileName, &p.Source, &p.IsActive, &p.LastSyncedAt,
		&p.CreatedAt, &p.UpdatedAt,
	)
}

func (r *repository) GetAll(ctx context.Context, routerID *int, connectionType string, mitraID *int) ([]PackageWithSyncStatus, error) {
	query := `
		SELECT p.id, p.name, COALESCE(p.description,''), p.connection_type, p.router_id,
		       p.mikrotik_profile_name, COALESCE(p.source,'manual'), p.is_active, p.last_synced_at,
		       p.created_at, p.updated_at,
		       COALESCE(sl.status,''), sl.checked_at
		FROM packages p
		JOIN mikrotik_routers mr ON mr.id = p.router_id
		LEFT JOIN LATERAL (
			SELECT status, checked_at
			FROM package_sync_log
			WHERE package_id = p.id
			ORDER BY checked_at DESC
			LIMIT 1
		) sl ON TRUE
		WHERE ($1::INTEGER IS NULL OR p.router_id = $1)
		  AND ($2 = '' OR p.connection_type = $2)
		  AND ($3::INTEGER IS NULL OR mr.mitra_id = $3)
		  AND p.is_active = TRUE
		ORDER BY p.connection_type ASC, p.name ASC`

	rows, err := r.db.QueryContext(ctx, query, routerID, connectionType, mitraID)
	if err != nil {
		return nil, fmt.Errorf("GetAll packages: %w", err)
	}
	defer rows.Close()

	var list []PackageWithSyncStatus
	for rows.Next() {
		var pw PackageWithSyncStatus
		if err := rows.Scan(
			&pw.ID, &pw.Name, &pw.Description, &pw.ConnectionType, &pw.RouterID,
			&pw.MikrotikProfileName, &pw.Source, &pw.IsActive, &pw.LastSyncedAt,
			&pw.CreatedAt, &pw.UpdatedAt,
			&pw.LastSyncStatus, &pw.LastCheckedAt,
		); err != nil {
			return nil, fmt.Errorf("GetAll packages scan: %w", err)
		}
		list = append(list, pw)
	}
	if list == nil {
		list = []PackageWithSyncStatus{}
	}
	return list, rows.Err()
}

func (r *repository) GetByID(ctx context.Context, id int) (*Package, error) {
	p := &Package{}
	err := scanPackage(
		r.db.QueryRowContext(ctx, `SELECT `+selectCols+` FROM packages WHERE id = $1 AND is_active = TRUE`, id),
		p,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("package not found")
	}
	if err != nil {
		return nil, fmt.Errorf("GetByID package: %w", err)
	}
	return p, nil
}

func (r *repository) GetByRouterAndType(ctx context.Context, routerID int, connectionType string) ([]Package, error) {
	query := `SELECT ` + selectCols + `
		FROM packages
		WHERE router_id = $1 AND is_active = TRUE`
	args := []any{routerID}

	if connectionType != "" {
		query += ` AND connection_type = $2`
		args = append(args, connectionType)
	}
	query += ` ORDER BY name ASC`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("GetByRouterAndType: %w", err)
	}
	defer rows.Close()

	var list []Package
	for rows.Next() {
		var p Package
		if err := scanPackage(rows, &p); err != nil {
			return nil, fmt.Errorf("GetByRouterAndType scan: %w", err)
		}
		list = append(list, p)
	}
	if list == nil {
		list = []Package{}
	}
	return list, rows.Err()
}

func (r *repository) UpsertFromProfile(ctx context.Context, routerID int, connType, profileName string, syncedAt time.Time) (bool, error) {
	var isNew bool
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO packages (name, connection_type, router_id, mikrotik_profile_name, source, is_active, last_synced_at)
		VALUES ($1, $2, $3, $4, 'auto', TRUE, $5)
		ON CONFLICT (router_id, connection_type, mikrotik_profile_name)
		  WHERE is_active = TRUE
		DO UPDATE SET
		  last_synced_at = EXCLUDED.last_synced_at,
		  is_active      = TRUE,
		  updated_at     = NOW()
		RETURNING (xmax = 0)`,
		profileName, connType, routerID, profileName, syncedAt,
	).Scan(&isNew)

	if err != nil {
		// If the unique index didn't fire (row exists but was inactive), try an update.
		res, updErr := r.db.ExecContext(ctx, `
			UPDATE packages
			SET is_active = TRUE, last_synced_at = $1, updated_at = NOW()
			WHERE router_id = $2 AND connection_type = $3 AND mikrotik_profile_name = $4
			  AND is_active = FALSE`,
			syncedAt, routerID, connType, profileName,
		)
		if updErr != nil {
			return false, fmt.Errorf("UpsertFromProfile: %w", updErr)
		}
		n, _ := res.RowsAffected()
		return n == 0, nil // n==0 means neither insert nor update matched — truly new
	}
	return isNew, nil
}

func (r *repository) DeactivateMissing(ctx context.Context, routerID int, connType string, keepNames []string, syncedAt time.Time) (int, error) {
	if len(keepNames) == 0 {
		return 0, nil
	}

	args := []any{routerID, connType}
	placeholders := make([]string, len(keepNames))
	for i, name := range keepNames {
		args = append(args, name)
		placeholders[i] = fmt.Sprintf("$%d", i+3)
	}

	query := fmt.Sprintf(`
		UPDATE packages
		SET is_active = FALSE, updated_at = NOW()
		WHERE router_id = $1
		  AND connection_type = $2
		  AND source = 'auto'
		  AND is_active = TRUE
		  AND mikrotik_profile_name NOT IN (%s)`,
		joinStrings(placeholders, ","),
	)

	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("DeactivateMissing: %w", err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

func joinStrings(ss []string, sep string) string {
	result := ""
	for i, s := range ss {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

// UpdateLabel updates only the admin-editable fields (name, description).
func (r *repository) UpdateLabel(ctx context.Context, id int, req UpdateLabelRequest) (*Package, error) {
	p := &Package{}
	err := scanPackage(
		r.db.QueryRowContext(ctx, `
			UPDATE packages
			SET name = CASE WHEN $1 = '' THEN name ELSE $1 END,
			    description = NULLIF($2,''),
			    updated_at  = NOW()
			WHERE id = $3 AND is_active = TRUE
			RETURNING `+selectCols,
			req.Name, req.Description, id,
		),
		p,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("package not found")
	}
	if err != nil {
		return nil, fmt.Errorf("UpdateLabel: %w", err)
	}
	return p, nil
}

func (r *repository) Delete(ctx context.Context, id int) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE packages SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND is_active=TRUE`, id)
	if err != nil {
		return fmt.Errorf("Delete package: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("package not found")
	}
	return nil
}

func (r *repository) Create(ctx context.Context, req CreatePackageRequest) (*Package, error) {
	p := &Package{}
	err := scanPackage(
		r.db.QueryRowContext(ctx, `
			INSERT INTO packages (name, description, connection_type, router_id, mikrotik_profile_name, source)
			VALUES ($1, NULLIF($2,''), $3, $4, $5, 'manual')
			RETURNING `+selectCols,
			req.Name, req.Description, req.ConnectionType, req.RouterID, req.MikrotikProfileName,
		),
		p,
	)
	if err != nil {
		return nil, fmt.Errorf("Create package: %w", err)
	}
	return p, nil
}

func (r *repository) WriteSyncLog(ctx context.Context, log SyncLog) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO package_sync_log (package_id, checked_at, status, stored_value, mikrotik_actual)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''))`,
		log.PackageID, log.CheckedAt, log.Status, log.StoredValue, log.MikrotikActual,
	)
	if err != nil {
		return fmt.Errorf("WriteSyncLog: %w", err)
	}
	return nil
}

func (r *repository) GetSyncLogs(ctx context.Context, packageID int, limit int) ([]SyncLog, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, package_id, checked_at, status, COALESCE(stored_value,''), COALESCE(mikrotik_actual,'')
		FROM package_sync_log
		WHERE package_id = $1
		ORDER BY checked_at DESC LIMIT $2`, packageID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetSyncLogs: %w", err)
	}
	defer rows.Close()

	var list []SyncLog
	for rows.Next() {
		var sl SyncLog
		if err := rows.Scan(&sl.ID, &sl.PackageID, &sl.CheckedAt, &sl.Status, &sl.StoredValue, &sl.MikrotikActual); err != nil {
			return nil, fmt.Errorf("GetSyncLogs scan: %w", err)
		}
		list = append(list, sl)
	}
	if list == nil {
		list = []SyncLog{}
	}
	return list, rows.Err()
}
