package pppoe

import (
	"context"
	"database/sql"
	"fmt"
)

type Repository interface {
	Create(ctx context.Context, secret *Secret) error
	FindAll(ctx context.Context, routerID int) ([]Secret, error)
	FindById(ctx context.Context, id int) (*Secret, error)
	Update(ctx context.Context, secret *Secret) error
	Delete(ctx context.Context, id int) error
	UpdateMikrotikID(ctx context.Context, id int, mikrotikID string) error
	UpdateSyncStatus(ctx context.Context, id int, status string) error
	SyncSecrets(ctx context.Context, routerID int, secrets []Secret) error
}

type repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, secret *Secret) error {
	query := `
		INSERT INTO mikrotik_pppoe_secrets 
		(router_id, mikrotik_id, name, password, profile, service, local_address, remote_address, comment, disabled, sync_status, last_synced_at) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
		RETURNING id`

	err := r.db.QueryRowContext(
		ctx,
		query,
		secret.RouterID,
		secret.MikrotikID,
		secret.Name,
		secret.Password,
		secret.Profile,
		secret.Service,
		secret.LocalAddress,
		secret.RemoteAddress,
		secret.Comment,
		secret.Disabled,
		secret.SyncStatus,
		secret.LastSyncedAt,
	).Scan(&secret.ID)

	if err != nil {
		return fmt.Errorf("failed to create PPPoE secret: %w", err)
	}

	return nil
}

func (r *repository) FindAll(ctx context.Context, routerID int) ([]Secret, error) {
	query := `
		SELECT id, router_id, mikrotik_id, name, password, profile, service, local_address, remote_address, comment, disabled, sync_status, last_synced_at 
		FROM mikrotik_pppoe_secrets 
		WHERE router_id = $1 
		ORDER BY name`

	rows, err := r.db.QueryContext(ctx, query, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PPPoE secrets: %w", err)
	}
	defer rows.Close()

	var secrets []Secret
	for rows.Next() {
		var secret Secret
		var mikrotikID, syncStatus sql.NullString
		var lastSyncedAt sql.NullTime
		err := rows.Scan(
			&secret.ID,
			&secret.RouterID,
			&mikrotikID,
			&secret.Name,
			&secret.Password,
			&secret.Profile,
			&secret.Service,
			&secret.LocalAddress,
			&secret.RemoteAddress,
			&secret.Comment,
			&secret.Disabled,
			&syncStatus,
			&lastSyncedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan PPPoE secret: %w", err)
		}
		if mikrotikID.Valid {
			secret.MikrotikID = mikrotikID.String
		}
		if syncStatus.Valid {
			secret.SyncStatus = syncStatus.String
		}
		if lastSyncedAt.Valid {
			secret.LastSyncedAt = &lastSyncedAt.Time
		}
		secrets = append(secrets, secret)
	}

	return secrets, nil
}

func (r *repository) FindById(ctx context.Context, id int) (*Secret, error) {
	query := `
		SELECT id, router_id, mikrotik_id, name, password, profile, service, local_address, remote_address, comment, disabled, sync_status, last_synced_at 
		FROM mikrotik_pppoe_secrets 
		WHERE id = $1`

	var secret Secret
	var mikrotikID, syncStatus sql.NullString
	var lastSyncedAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&secret.ID,
		&secret.RouterID,
		&mikrotikID,
		&secret.Name,
		&secret.Password,
		&secret.Profile,
		&secret.Service,
		&secret.LocalAddress,
		&secret.RemoteAddress,
		&secret.Comment,
		&secret.Disabled,
		&syncStatus,
		&lastSyncedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("PPPoE secret not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch PPPoE secret: %w", err)
	}
	
	if mikrotikID.Valid {
		secret.MikrotikID = mikrotikID.String
	}
	if syncStatus.Valid {
		secret.SyncStatus = syncStatus.String
	}
	if lastSyncedAt.Valid {
		secret.LastSyncedAt = &lastSyncedAt.Time
	}

	return &secret, nil
}

func (r *repository) Update(ctx context.Context, secret *Secret) error {
	query := `
		UPDATE mikrotik_pppoe_secrets 
		SET mikrotik_id = $1, name = $2, password = $3, profile = $4, service = $5, 
		    local_address = $6, remote_address = $7, comment = $8, disabled = $9,
			sync_status = $10, last_synced_at = $11
		WHERE id = $12`

	result, err := r.db.ExecContext(
		ctx,
		query,
		secret.MikrotikID,
		secret.Name,
		secret.Password,
		secret.Profile,
		secret.Service,
		secret.LocalAddress,
		secret.RemoteAddress,
		secret.Comment,
		secret.Disabled,
		secret.SyncStatus,
		secret.LastSyncedAt,
		secret.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update PPPoE secret: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("PPPoE secret not found")
	}

	return nil
}

func (r *repository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM mikrotik_pppoe_secrets WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete PPPoE secret: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("PPPoE secret not found")
	}

	return nil
}

func (r *repository) UpdateMikrotikID(ctx context.Context, id int, mikrotikID string) error {
	query := `UPDATE mikrotik_pppoe_secrets SET mikrotik_id = $1 WHERE id = $2`
	result, err := r.db.ExecContext(ctx, query, mikrotikID, id)
	if err != nil {
		return fmt.Errorf("failed to update mikrotik ID: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("PPPoE secret not found")
	}
	return nil
}

func (r *repository) UpdateSyncStatus(ctx context.Context, id int, status string) error {
	query := `UPDATE mikrotik_pppoe_secrets SET sync_status = $1 WHERE id = $2`
	result, err := r.db.ExecContext(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update sync status: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("PPPoE secret not found")
	}
	return nil
}

func (r *repository) SyncSecrets(ctx context.Context, routerID int, secrets []Secret) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Update all existing to not_found initially
	_, err = tx.ExecContext(ctx, `UPDATE mikrotik_pppoe_secrets SET sync_status = 'not_found' WHERE router_id = $1`, routerID)
	if err != nil {
		return err
	}

	for _, s := range secrets {
		// Try to match by mikrotik_id or name
		var id int
		err = tx.QueryRowContext(ctx, `SELECT id FROM mikrotik_pppoe_secrets WHERE router_id = $1 AND (mikrotik_id = $2 OR name = $3) LIMIT 1`, routerID, s.MikrotikID, s.Name).Scan(&id)
		
		if err == sql.ErrNoRows {
			// Insert new
			_, err = tx.ExecContext(ctx, `
				INSERT INTO mikrotik_pppoe_secrets 
				(router_id, mikrotik_id, name, password, profile, service, local_address, remote_address, comment, disabled, sync_status, last_synced_at) 
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', NOW())`,
				routerID, s.MikrotikID, s.Name, s.Password, s.Profile, s.Service, s.LocalAddress, s.RemoteAddress, s.Comment, s.Disabled)
			if err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			// Update existing
			_, err = tx.ExecContext(ctx, `
				UPDATE mikrotik_pppoe_secrets 
				SET mikrotik_id = $1, name = $2, password = $3, profile = $4, service = $5, 
					local_address = $6, remote_address = $7, comment = $8, disabled = $9, 
					sync_status = 'synced', last_synced_at = NOW()
				WHERE id = $10`,
				s.MikrotikID, s.Name, s.Password, s.Profile, s.Service, s.LocalAddress, s.RemoteAddress, s.Comment, s.Disabled, id)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}
