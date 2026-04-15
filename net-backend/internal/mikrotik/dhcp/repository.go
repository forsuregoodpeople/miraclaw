package dhcp

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"time"
)

type IDHCPLeaseRepository interface {
	FindAll(ctx context.Context, routerID int) ([]DHCPLease, error)
	FindByID(ctx context.Context, id int) (*DHCPLease, error)
	FindByMAC(ctx context.Context, routerID int, macAddress string) (*DHCPLease, error)
	FindByAddress(ctx context.Context, routerID int, address string) (*DHCPLease, error)
	Create(ctx context.Context, lease *DHCPLease) error
	Update(ctx context.Context, lease *DHCPLease) error
	Upsert(ctx context.Context, lease *DHCPLease) error
	Disable(ctx context.Context, id int) error
	Block(ctx context.Context, id int) error
	Enable(ctx context.Context, id int) error
	MakeStatic(ctx context.Context, id int) error
	MakeDynamic(ctx context.Context, id int) error
	Delete(ctx context.Context, id int) error
	// DeleteStaleByRouter removes dynamic (non-isolir) leases for a router
	// whose MAC addresses are NOT in seenMACs (i.e., no longer on MikroTik).
	DeleteStaleByRouter(ctx context.Context, routerID int, seenMACs []string) error
}

type DHCPLeaseRepository struct {
	db *sql.DB
}

func NewDHCPLeaseRepository(db *sql.DB) IDHCPLeaseRepository {
	return &DHCPLeaseRepository{db: db}
}

func (r *DHCPLeaseRepository) FindAll(ctx context.Context, routerID int) ([]DHCPLease, error) {
	query := `
		SELECT id, router_id, address, mac_address, host_name, client_id, server,
		       status, expires_after, dynamic, is_isolir, block_type, active_address, active_mac,
		       active_server, active_state, last_seen, comment
		FROM mikrotik_dhcp_leases
		WHERE router_id = $1
		ORDER BY address`

	rows, err := r.db.QueryContext(ctx, query, routerID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP leases: %w", err)
	}
	defer rows.Close()

	var leases []DHCPLease
	for rows.Next() {
		var lease DHCPLease
		var lastSeen sql.NullTime
		err := rows.Scan(
			&lease.ID,
			&lease.RouterID,
			&lease.Address,
			&lease.MACAddress,
			&lease.HostName,
			&lease.ClientID,
			&lease.Server,
			&lease.Status,
			&lease.ExpiresAfter,
			&lease.Dynamic,
			&lease.IsIsolir,
			&lease.BlockType,
			&lease.ActiveAddress,
			&lease.ActiveMAC,
			&lease.ActiveServer,
			&lease.ActiveState,
			&lastSeen,
			&lease.Comment,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan DHCP lease: %w", err)
		}
		if lastSeen.Valid {
			lease.LastSeen = lastSeen.Time.Format(time.RFC3339)
		} else {
			lease.LastSeen = ""
		}
		leases = append(leases, lease)
	}

	return leases, nil
}

func (r *DHCPLeaseRepository) FindByID(ctx context.Context, id int) (*DHCPLease, error) {
	query := `
		SELECT id, router_id, address, mac_address, host_name, client_id, server,
		       status, expires_after, dynamic, is_isolir, block_type, active_address, active_mac,
		       active_server, active_state, last_seen, comment
		FROM mikrotik_dhcp_leases
		WHERE id = $1`

	var lease DHCPLease
	var lastSeen sql.NullTime
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&lease.ID,
		&lease.RouterID,
		&lease.Address,
		&lease.MACAddress,
		&lease.HostName,
		&lease.ClientID,
		&lease.Server,
		&lease.Status,
		&lease.ExpiresAfter,
		&lease.Dynamic,
		&lease.IsIsolir,
		&lease.BlockType,
		&lease.ActiveAddress,
		&lease.ActiveMAC,
		&lease.ActiveServer,
		&lease.ActiveState,
		&lastSeen,
		&lease.Comment,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("DHCP lease not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP lease: %w", err)
	}

	if lastSeen.Valid {
		lease.LastSeen = lastSeen.Time.Format(time.RFC3339)
	} else {
		lease.LastSeen = ""
	}

	return &lease, nil
}

func (r *DHCPLeaseRepository) FindByMAC(ctx context.Context, routerID int, macAddress string) (*DHCPLease, error) {
	query := `
		SELECT id, router_id, address, mac_address, host_name, client_id, server,
		       status, expires_after, dynamic, is_isolir, block_type, active_address, active_mac,
		       active_server, active_state, last_seen, comment
		FROM mikrotik_dhcp_leases
		WHERE router_id = $1 AND mac_address = $2`

	var lease DHCPLease
	var lastSeen sql.NullTime
	err := r.db.QueryRowContext(ctx, query, routerID, macAddress).Scan(
		&lease.ID,
		&lease.RouterID,
		&lease.Address,
		&lease.MACAddress,
		&lease.HostName,
		&lease.ClientID,
		&lease.Server,
		&lease.Status,
		&lease.ExpiresAfter,
		&lease.Dynamic,
		&lease.IsIsolir,
		&lease.BlockType,
		&lease.ActiveAddress,
		&lease.ActiveMAC,
		&lease.ActiveServer,
		&lease.ActiveState,
		&lastSeen,
		&lease.Comment,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("DHCP lease not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP lease: %w", err)
	}

	if lastSeen.Valid {
		lease.LastSeen = lastSeen.Time.Format(time.RFC3339)
	} else {
		lease.LastSeen = ""
	}

	return &lease, nil
}

func (r *DHCPLeaseRepository) FindByAddress(ctx context.Context, routerID int, address string) (*DHCPLease, error) {
	query := `
		SELECT id, router_id, address, mac_address, host_name, client_id, server,
		       status, expires_after, dynamic, is_isolir, block_type, active_address, active_mac,
		       active_server, active_state, last_seen, comment
		FROM mikrotik_dhcp_leases
		WHERE router_id = $1 AND address = $2`

	var lease DHCPLease
	var lastSeen sql.NullTime
	err := r.db.QueryRowContext(ctx, query, routerID, address).Scan(
		&lease.ID,
		&lease.RouterID,
		&lease.Address,
		&lease.MACAddress,
		&lease.HostName,
		&lease.ClientID,
		&lease.Server,
		&lease.Status,
		&lease.ExpiresAfter,
		&lease.Dynamic,
		&lease.IsIsolir,
		&lease.BlockType,
		&lease.ActiveAddress,
		&lease.ActiveMAC,
		&lease.ActiveServer,
		&lease.ActiveState,
		&lastSeen,
		&lease.Comment,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("DHCP lease not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch DHCP lease: %w", err)
	}

	if lastSeen.Valid {
		lease.LastSeen = lastSeen.Time.Format(time.RFC3339)
	} else {
		lease.LastSeen = ""
	}

	return &lease, nil
}

func (r *DHCPLeaseRepository) Create(ctx context.Context, lease *DHCPLease) error {
	query := `
		INSERT INTO mikrotik_dhcp_leases
		(router_id, address, mac_address, host_name, client_id, server, status,
		 expires_after, dynamic, is_isolir, active_address, active_mac, active_server,
		 active_state, last_seen, comment)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING id`

	err := r.db.QueryRowContext(
		ctx,
		query,
		lease.RouterID,
		lease.Address,
		lease.MACAddress,
		lease.HostName,
		lease.ClientID,
		lease.Server,
		lease.Status,
		lease.ExpiresAfter,
		lease.Dynamic,
		lease.IsIsolir,
		lease.ActiveAddress,
		lease.ActiveMAC,
		lease.ActiveServer,
		lease.ActiveState,
		parseMikrotikLastSeen(lease.LastSeen),
		lease.Comment,
	).Scan(&lease.ID)

	if err != nil {
		return fmt.Errorf("failed to create DHCP lease: %w", err)
	}

	return nil
}

func (r *DHCPLeaseRepository) Update(ctx context.Context, lease *DHCPLease) error {
	query := `
		UPDATE mikrotik_dhcp_leases
		SET address = $1, mac_address = $2, host_name = $3, client_id = $4,
		    server = $5, status = $6, expires_after = $7, dynamic = $8, is_isolir = $9,
		    active_address = $10, active_mac = $11, active_server = $12,
		    active_state = $13, last_seen = $14, comment = $15
		WHERE id = $16`

	result, err := r.db.ExecContext(
		ctx,
		query,
		lease.Address,
		lease.MACAddress,
		lease.HostName,
		lease.ClientID,
		lease.Server,
		lease.Status,
		lease.ExpiresAfter,
		lease.Dynamic,
		lease.IsIsolir,
		lease.ActiveAddress,
		lease.ActiveMAC,
		lease.ActiveServer,
		lease.ActiveState,
		parseMikrotikLastSeen(lease.LastSeen),
		lease.Comment,
		lease.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update DHCP lease: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

// parseMikrotikLastSeen converts a MikroTik relative duration string like
// "1s", "4m12s", "1h30m", "2d3h" into an absolute timestamp (NOW - duration).
// Returns a sql.NullTime that is Valid=false (NULL) for empty or unparseable values.
var mikrotikDurationRe = regexp.MustCompile(`(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?`)

func parseMikrotikLastSeen(s string) sql.NullTime {
	if s == "" {
		return sql.NullTime{}
	}
	// Try Go's built-in parser first (handles "1s", "4m12s", "1h30m")
	if d, err := time.ParseDuration(s); err == nil {
		return sql.NullTime{Time: time.Now().Add(-d), Valid: true}
	}
	// Custom parser for MikroTik format with weeks/days ("2d3h", "1w2d3h4m5s")
	m := mikrotikDurationRe.FindStringSubmatch(s)
	if m == nil || m[0] == "" {
		return sql.NullTime{}
	}
	parse := func(s string) time.Duration {
		if s == "" {
			return 0
		}
		n, _ := strconv.Atoi(s)
		return time.Duration(n)
	}
	d := parse(m[1])*7*24*time.Hour +
		parse(m[2])*24*time.Hour +
		parse(m[3])*time.Hour +
		parse(m[4])*time.Minute +
		parse(m[5])*time.Second
	if d == 0 {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: time.Now().Add(-d), Valid: true}
}

func (r *DHCPLeaseRepository) Upsert(ctx context.Context, lease *DHCPLease) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// When an IP is reassigned to a new MAC, delete the stale lease first.
	// Without this, the INSERT below would violate idx_dhcp_router_address (router_id, address)
	// because ON CONFLICT only covers (router_id, mac_address).
	_, err = tx.ExecContext(ctx, `
		DELETE FROM mikrotik_dhcp_leases
		WHERE router_id = $1 AND address = $2 AND mac_address != $3`,
		lease.RouterID, lease.Address, lease.MACAddress,
	)
	if err != nil {
		return fmt.Errorf("failed to clear conflicting lease: %w", err)
	}

	query := `
		INSERT INTO mikrotik_dhcp_leases
		(router_id, address, mac_address, host_name, client_id, server, status,
		 expires_after, dynamic, is_isolir, active_address, active_mac, active_server,
		 active_state, last_seen, comment)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		ON CONFLICT (router_id, mac_address) DO UPDATE SET
			address        = EXCLUDED.address,
			host_name      = EXCLUDED.host_name,
			client_id      = EXCLUDED.client_id,
			server         = EXCLUDED.server,
			status         = EXCLUDED.status,
			expires_after  = EXCLUDED.expires_after,
			dynamic        = EXCLUDED.dynamic,
			active_address = EXCLUDED.active_address,
			active_mac     = EXCLUDED.active_mac,
			active_server  = EXCLUDED.active_server,
			active_state   = EXCLUDED.active_state,
			last_seen      = EXCLUDED.last_seen,
			comment        = EXCLUDED.comment,
			updated_at     = NOW()
		RETURNING id`

	lastSeen := parseMikrotikLastSeen(lease.LastSeen)
	err = tx.QueryRowContext(ctx, query,
		lease.RouterID, lease.Address, lease.MACAddress, lease.HostName,
		lease.ClientID, lease.Server, lease.Status, lease.ExpiresAfter,
		lease.Dynamic, lease.IsIsolir, lease.ActiveAddress, lease.ActiveMAC,
		lease.ActiveServer, lease.ActiveState, lastSeen, lease.Comment,
	).Scan(&lease.ID)
	if err != nil {
		return fmt.Errorf("failed to upsert DHCP lease: %w", err)
	}

	return tx.Commit()
}

func (r *DHCPLeaseRepository) Disable(ctx context.Context, id int) error {
	query := `UPDATE mikrotik_dhcp_leases SET is_isolir = true, block_type = 'isolir' WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to disable DHCP lease: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) Block(ctx context.Context, id int) error {
	query := `UPDATE mikrotik_dhcp_leases SET is_isolir = true, block_type = 'blokir' WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to block DHCP lease: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) Enable(ctx context.Context, id int) error {
	query := `UPDATE mikrotik_dhcp_leases SET is_isolir = false, block_type = 'none' WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to enable DHCP lease: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) MakeStatic(ctx context.Context, id int) error {
	query := `UPDATE mikrotik_dhcp_leases SET dynamic = false WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to make DHCP lease static: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) MakeDynamic(ctx context.Context, id int) error {
	query := `UPDATE mikrotik_dhcp_leases SET dynamic = true WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to make DHCP lease dynamic: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM mikrotik_dhcp_leases WHERE id = $1`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete DHCP lease: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("DHCP lease not found")
	}

	return nil
}

func (r *DHCPLeaseRepository) DeleteStaleByRouter(ctx context.Context, routerID int, seenMACs []string) error {
	if len(seenMACs) == 0 {
		// Safety: never delete everything — router might be temporarily unreachable.
		return nil
	}

	// Build $2,$3,...,$N placeholders for the MAC list
	placeholders := make([]string, len(seenMACs))
	args := make([]interface{}, len(seenMACs)+1)
	args[0] = routerID
	for i, mac := range seenMACs {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args[i+1] = mac
	}

	query := fmt.Sprintf(`
		DELETE FROM mikrotik_dhcp_leases
		WHERE router_id = $1
		  AND dynamic = true
		  AND is_isolir = false
		  AND mac_address NOT IN (%s)`,
		joinStrings(placeholders),
	)

	_, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to delete stale DHCP leases for router %d: %w", routerID, err)
	}
	return nil
}

func joinStrings(s []string) string {
	result := ""
	for i, v := range s {
		if i > 0 {
			result += ","
		}
		result += v
	}
	return result
}
