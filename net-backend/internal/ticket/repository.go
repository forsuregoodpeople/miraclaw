package ticket

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type ITicketRepository interface {
	Create(ctx context.Context, t *Ticket) error
	GetByID(ctx context.Context, id int) (*Ticket, error)
	GetAll(ctx context.Context, filters TicketFilters) ([]Ticket, error)
	CheckDuplicate(ctx context.Context, customerID *int, mikrotikRef string) ([]Ticket, error)
	Assign(ctx context.Context, id, assignedTo, assignedBy int) error
	UpdateStatus(ctx context.Context, id int, status string) error
	Update(ctx context.Context, id int, req UpdateTicketRequest) error
	Delete(ctx context.Context, id int) error
	SetResolvedAt(ctx context.Context, id int) error
	SetClosedAt(ctx context.Context, id int) error
	AddTimeline(ctx context.Context, entry *TimelineEntry) error
	GetTimeline(ctx context.Context, ticketID int) ([]TimelineEntry, error)
	GetNextSequence(ctx context.Context, date string) (int, error)
}

type TicketRepository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *TicketRepository {
	return &TicketRepository{db: db}
}

func (r *TicketRepository) GetNextSequence(ctx context.Context, date string) (int, error) {
	var seq int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) + 1 FROM tickets WHERE ticket_number LIKE $1`,
		"TKT-"+date+"-%",
	).Scan(&seq)
	return seq, err
}

func (r *TicketRepository) Create(ctx context.Context, t *Ticket) error {
	query := `
		INSERT INTO tickets
		    (ticket_number, customer_id, customer_name, mikrotik_ref, onu_id, router_id,
		     location_odp, category, priority, title, description, status, sla_deadline, created_by)
		VALUES ($1, NULLIF($2, 0), $3, NULLIF($4, ''), NULLIF($5, 0), NULLIF($6, 0),
		        NULLIF($7, ''), $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, created_at, updated_at`

	customerID := 0
	if t.CustomerID != nil {
		customerID = *t.CustomerID
	}
	onuID := 0
	if t.ONUID != nil {
		onuID = *t.ONUID
	}
	routerID := 0
	if t.RouterID != nil {
		routerID = *t.RouterID
	}

	return r.db.QueryRowContext(ctx, query,
		t.TicketNumber, customerID, t.CustomerName, t.MikrotikRef, onuID, routerID,
		t.LocationODP, t.Category, t.Priority, t.Title, t.Description, t.Status, t.SLADeadline, t.CreatedBy,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

const ticketSelectCols = `
	id, ticket_number,
	customer_id, customer_name, COALESCE(mikrotik_ref, ''),
	onu_id, router_id, COALESCE(location_odp, ''),
	category, priority, title, description, status,
	assigned_to, assigned_by,
	assigned_at, resolved_at, closed_at, sla_deadline,
	(sla_deadline < NOW() AND status NOT IN ('RESOLVED','CLOSED')) AS is_overdue,
	created_by, created_at, updated_at`

func scanTicket(row interface {
	Scan(dest ...any) error
}) (*Ticket, error) {
	var t Ticket
	var (
		customerID sql.NullInt64
		onuID      sql.NullInt64
		routerID   sql.NullInt64
		assignedTo sql.NullInt64
		assignedBy sql.NullInt64
		assignedAt sql.NullTime
		resolvedAt sql.NullTime
		closedAt   sql.NullTime
	)
	err := row.Scan(
		&t.ID, &t.TicketNumber,
		&customerID, &t.CustomerName, &t.MikrotikRef,
		&onuID, &routerID, &t.LocationODP,
		&t.Category, &t.Priority, &t.Title, &t.Description, &t.Status,
		&assignedTo, &assignedBy,
		&assignedAt, &resolvedAt, &closedAt, &t.SLADeadline,
		&t.IsOverdue,
		&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if customerID.Valid {
		v := int(customerID.Int64)
		t.CustomerID = &v
	}
	if onuID.Valid {
		v := int(onuID.Int64)
		t.ONUID = &v
	}
	if routerID.Valid {
		v := int(routerID.Int64)
		t.RouterID = &v
	}
	if assignedTo.Valid {
		v := int(assignedTo.Int64)
		t.AssignedTo = &v
	}
	if assignedBy.Valid {
		v := int(assignedBy.Int64)
		t.AssignedBy = &v
	}
	if assignedAt.Valid {
		t.AssignedAt = &assignedAt.Time
	}
	if resolvedAt.Valid {
		t.ResolvedAt = &resolvedAt.Time
	}
	if closedAt.Valid {
		t.ClosedAt = &closedAt.Time
	}
	return &t, nil
}

func (r *TicketRepository) GetByID(ctx context.Context, id int) (*Ticket, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+ticketSelectCols+` FROM tickets WHERE id = $1`, id)
	t, err := scanTicket(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("ticket not found")
		}
		return nil, fmt.Errorf("GetByID: %w", err)
	}
	return t, nil
}

func (r *TicketRepository) GetAll(ctx context.Context, filters TicketFilters) ([]Ticket, error) {
	where := []string{"1=1"}
	args := []any{}
	n := 1

	if filters.Status != "" {
		where = append(where, fmt.Sprintf("status = $%d", n))
		args = append(args, filters.Status)
		n++
	}
	if filters.AssignedTo > 0 {
		where = append(where, fmt.Sprintf("assigned_to = $%d", n))
		args = append(args, filters.AssignedTo)
		n++
	}
	if filters.Category != "" {
		where = append(where, fmt.Sprintf("category = $%d", n))
		args = append(args, filters.Category)
		n++
	}
	if filters.Overdue {
		where = append(where, "sla_deadline < NOW() AND status NOT IN ('RESOLVED','CLOSED')")
	}
	_ = n

	query := `SELECT ` + ticketSelectCols + ` FROM tickets WHERE ` +
		strings.Join(where, " AND ") + ` ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("GetAll query: %w", err)
	}
	defer rows.Close()

	var tickets []Ticket
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, fmt.Errorf("GetAll scan: %w", err)
		}
		tickets = append(tickets, *t)
	}
	if tickets == nil {
		tickets = []Ticket{}
	}
	return tickets, rows.Err()
}

func (r *TicketRepository) CheckDuplicate(ctx context.Context, customerID *int, mikrotikRef string) ([]Ticket, error) {
	cidVal := 0
	if customerID != nil {
		cidVal = *customerID
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+ticketSelectCols+`
		 FROM tickets
		 WHERE status NOT IN ('RESOLVED','CLOSED')
		   AND (($1 > 0 AND customer_id = $1) OR ($2 != '' AND mikrotik_ref = $2))
		   AND created_at >= NOW() - INTERVAL '30 minutes'
		 ORDER BY created_at DESC
		 LIMIT 5`,
		cidVal, mikrotikRef,
	)
	if err != nil {
		return nil, fmt.Errorf("CheckDuplicate: %w", err)
	}
	defer rows.Close()

	var tickets []Ticket
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, fmt.Errorf("CheckDuplicate scan: %w", err)
		}
		tickets = append(tickets, *t)
	}
	if tickets == nil {
		tickets = []Ticket{}
	}
	return tickets, rows.Err()
}

func (r *TicketRepository) Assign(ctx context.Context, id, assignedTo, assignedBy int) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE tickets
		 SET assigned_to = $1, assigned_by = $2, assigned_at = NOW(), status = 'ASSIGNED', updated_at = NOW()
		 WHERE id = $3`,
		assignedTo, assignedBy, id,
	)
	if err != nil {
		return fmt.Errorf("Assign: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("ticket not found")
	}
	return nil
}

func (r *TicketRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("UpdateStatus: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("ticket not found")
	}
	return nil
}

func (r *TicketRepository) Update(ctx context.Context, id int, req UpdateTicketRequest) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE tickets
		 SET category = $1, priority = $2, title = $3, description = $4, location_odp = NULLIF($5,''), updated_at = NOW()
		 WHERE id = $6`,
		req.Category, req.Priority, req.Title, req.Description, req.LocationODP, id,
	)
	if err != nil {
		return fmt.Errorf("Update: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("ticket not found")
	}
	return nil
}

func (r *TicketRepository) Delete(ctx context.Context, id int) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM tickets WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("Delete: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("ticket not found")
	}
	return nil
}

func (r *TicketRepository) SetResolvedAt(ctx context.Context, id int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE tickets SET resolved_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *TicketRepository) SetClosedAt(ctx context.Context, id int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE tickets SET closed_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *TicketRepository) AddTimeline(ctx context.Context, entry *TimelineEntry) error {
	var metaJSON []byte
	if entry.Metadata != nil {
		var err error
		metaJSON, err = json.Marshal(entry.Metadata)
		if err != nil {
			return fmt.Errorf("marshal metadata: %w", err)
		}
	}

	return r.db.QueryRowContext(ctx, `
		INSERT INTO ticket_timeline (ticket_id, actor_id, actor_name, action, from_status, to_status, comment, metadata)
		VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), $8)
		RETURNING id, created_at`,
		entry.TicketID, entry.ActorID, entry.ActorName, entry.Action,
		entry.FromStatus, entry.ToStatus, entry.Comment, metaJSON,
	).Scan(&entry.ID, &entry.CreatedAt)
}

func (r *TicketRepository) GetTimeline(ctx context.Context, ticketID int) ([]TimelineEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, ticket_id, actor_id, actor_name, action,
		       COALESCE(from_status,''), COALESCE(to_status,''), COALESCE(comment,''),
		       COALESCE(metadata::text, '{}'), created_at
		FROM ticket_timeline
		WHERE ticket_id = $1
		ORDER BY created_at ASC`, ticketID,
	)
	if err != nil {
		return nil, fmt.Errorf("GetTimeline: %w", err)
	}
	defer rows.Close()

	var entries []TimelineEntry
	for rows.Next() {
		var e TimelineEntry
		var metaStr string
		if err := rows.Scan(
			&e.ID, &e.TicketID, &e.ActorID, &e.ActorName, &e.Action,
			&e.FromStatus, &e.ToStatus, &e.Comment, &metaStr, &e.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("GetTimeline scan: %w", err)
		}
		if metaStr != "{}" && metaStr != "" {
			_ = json.Unmarshal([]byte(metaStr), &e.Metadata)
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []TimelineEntry{}
	}
	return entries, rows.Err()
}

// ensure time import is used
var _ = time.Now
