package static

import (
	"context"
	"database/sql"
	"fmt"
)

type IStaticBindingRepository interface {
	FindAll(ctx context.Context, routerID int) ([]StaticBinding, error)
	FindByID(ctx context.Context, id int) (*StaticBinding, error)
	FindByMAC(ctx context.Context, routerID int, macAddress string) (*StaticBinding, error)
	FindByAddress(ctx context.Context, routerID int, address string) (*StaticBinding, error)
	Create(ctx context.Context, binding *StaticBinding) error
	Update(ctx context.Context, binding *StaticBinding) error
	Block(ctx context.Context, id int) error
	Unblock(ctx context.Context, id int) error
	Delete(ctx context.Context, id int) error
	Upsert(ctx context.Context, binding *StaticBinding) error
}

type StaticBindingRepository struct {
	db *sql.DB
}

func NewStaticBindingRepository(db *sql.DB) IStaticBindingRepository {
	return &StaticBindingRepository{db: db}
}

const selectColumns = `id, router_id, address, mac_address, server, type, to_address, comment, is_disabled, is_online, last_seen, updated_at`

func (r *StaticBindingRepository) FindAll(ctx context.Context, routerID int) ([]StaticBinding, error) {
	query := `
		SELECT ` + selectColumns + `
		FROM mikrotik_static_bindings
		WHERE router_id = $1
		ORDER BY address`

	rows, err := r.db.QueryContext(ctx, query, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch static bindings: %w", err)
	}
	defer rows.Close()

	var bindings []StaticBinding
	for rows.Next() {
		var b StaticBinding
		if err := rows.Scan(
			&b.ID, &b.RouterID, &b.Address, &b.MACAddress, &b.Server,
			&b.Type, &b.ToAddress, &b.Comment, &b.IsDisabled, &b.IsOnline, &b.LastSeen, &b.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan static binding: %w", err)
		}
		bindings = append(bindings, b)
	}

	return bindings, nil
}

func (r *StaticBindingRepository) FindByID(ctx context.Context, id int) (*StaticBinding, error) {
	query := `SELECT ` + selectColumns + ` FROM mikrotik_static_bindings WHERE id = $1`

	var b StaticBinding
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&b.ID, &b.RouterID, &b.Address, &b.MACAddress, &b.Server,
		&b.Type, &b.ToAddress, &b.Comment, &b.IsDisabled, &b.IsOnline, &b.LastSeen, &b.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("static binding not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch static binding: %w", err)
	}
	return &b, nil
}

func (r *StaticBindingRepository) FindByMAC(ctx context.Context, routerID int, macAddress string) (*StaticBinding, error) {
	query := `SELECT ` + selectColumns + ` FROM mikrotik_static_bindings WHERE router_id = $1 AND mac_address = $2`

	var b StaticBinding
	err := r.db.QueryRowContext(ctx, query, routerID, macAddress).Scan(
		&b.ID, &b.RouterID, &b.Address, &b.MACAddress, &b.Server,
		&b.Type, &b.ToAddress, &b.Comment, &b.IsDisabled, &b.IsOnline, &b.LastSeen, &b.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("static binding not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch static binding: %w", err)
	}
	return &b, nil
}

func (r *StaticBindingRepository) FindByAddress(ctx context.Context, routerID int, address string) (*StaticBinding, error) {
	query := `SELECT ` + selectColumns + ` FROM mikrotik_static_bindings WHERE router_id = $1 AND address = $2`

	var b StaticBinding
	err := r.db.QueryRowContext(ctx, query, routerID, address).Scan(
		&b.ID, &b.RouterID, &b.Address, &b.MACAddress, &b.Server,
		&b.Type, &b.ToAddress, &b.Comment, &b.IsDisabled, &b.IsOnline, &b.LastSeen, &b.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("static binding not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch static binding: %w", err)
	}
	return &b, nil
}

func (r *StaticBindingRepository) Create(ctx context.Context, b *StaticBinding) error {
	query := `
		INSERT INTO mikrotik_static_bindings
		(router_id, address, mac_address, server, type, to_address, comment, is_disabled, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		b.RouterID, b.Address, b.MACAddress, b.Server, b.Type,
		b.ToAddress, b.Comment, b.IsDisabled, b.LastSeen,
	).Scan(&b.ID, &b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to create static binding: %w", err)
	}
	return nil
}

func (r *StaticBindingRepository) Update(ctx context.Context, b *StaticBinding) error {
	query := `
		UPDATE mikrotik_static_bindings
		SET address = $1, mac_address = $2, server = $3, type = $4,
		    to_address = $5, comment = $6, is_disabled = $7, last_seen = $8,
		    updated_at = NOW()
		WHERE id = $9`

	result, err := r.db.ExecContext(ctx, query,
		b.Address, b.MACAddress, b.Server, b.Type,
		b.ToAddress, b.Comment, b.IsDisabled, b.LastSeen, b.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update static binding: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("static binding not found")
	}
	return nil
}

func (r *StaticBindingRepository) Block(ctx context.Context, id int) error {
	result, err := r.db.ExecContext(ctx,
		`UPDATE mikrotik_static_bindings SET type = 'blocked', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to block static binding: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("static binding not found")
	}
	return nil
}

func (r *StaticBindingRepository) Unblock(ctx context.Context, id int) error {
	result, err := r.db.ExecContext(ctx,
		`UPDATE mikrotik_static_bindings SET type = 'bypassed', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to unblock static binding: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("static binding not found")
	}
	return nil
}

func (r *StaticBindingRepository) Delete(ctx context.Context, id int) error {
	result, err := r.db.ExecContext(ctx,
		`DELETE FROM mikrotik_static_bindings WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete static binding: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("static binding not found")
	}
	return nil
}

func (r *StaticBindingRepository) Upsert(ctx context.Context, b *StaticBinding) error {
	query := `
		INSERT INTO mikrotik_static_bindings
		(router_id, address, mac_address, server, type, to_address, comment, is_disabled, is_online, last_seen, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		ON CONFLICT (router_id, mac_address) DO UPDATE SET
			address     = EXCLUDED.address,
			server      = EXCLUDED.server,
			type        = EXCLUDED.type,
			to_address  = EXCLUDED.to_address,
			comment     = EXCLUDED.comment,
			is_disabled = EXCLUDED.is_disabled,
			is_online   = EXCLUDED.is_online,
			last_seen   = EXCLUDED.last_seen,
			updated_at  = NOW()
		RETURNING id, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		b.RouterID, b.Address, b.MACAddress, b.Server, b.Type,
		b.ToAddress, b.Comment, b.IsDisabled, b.IsOnline, b.LastSeen,
	).Scan(&b.ID, &b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to upsert static binding: %w", err)
	}
	return nil
}
