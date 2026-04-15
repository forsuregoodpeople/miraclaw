package ticket

import "time"

var AllowedTransitions = map[string][]string{
	"OPEN":        {"ASSIGNED"},
	"ASSIGNED":    {"IN_PROGRESS"},
	"IN_PROGRESS": {"RESOLVED"},
	"RESOLVED":    {"CLOSED", "OPEN"},
	"CLOSED":      {"OPEN"},
}

var SLADurations = map[string]time.Duration{
	"CRITICAL": 2 * time.Hour,
	"HIGH":     4 * time.Hour,
	"MEDIUM":   8 * time.Hour,
	"LOW":      24 * time.Hour,
}

type Ticket struct {
	ID           int        `json:"id"`
	TicketNumber string     `json:"ticket_number"`
	CustomerID   *int       `json:"customer_id,omitempty"`
	CustomerName string     `json:"customer_name"`
	MikrotikRef  string     `json:"mikrotik_ref,omitempty"`
	ONUID        *int       `json:"onu_id,omitempty"`
	RouterID     *int       `json:"router_id,omitempty"`
	LocationODP  string     `json:"location_odp,omitempty"`
	Category     string     `json:"category"`
	Priority     string     `json:"priority"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Status       string     `json:"status"`
	AssignedTo   *int       `json:"assigned_to,omitempty"`
	AssignedBy   *int       `json:"assigned_by,omitempty"`
	AssignedAt   *time.Time `json:"assigned_at,omitempty"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`
	SLADeadline  time.Time  `json:"sla_deadline"`
	IsOverdue    bool       `json:"is_overdue"`
	CreatedBy    int        `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type TimelineEntry struct {
	ID         int            `json:"id"`
	TicketID   int            `json:"ticket_id"`
	ActorID    int            `json:"actor_id"`
	ActorName  string         `json:"actor_name"`
	Action     string         `json:"action"`
	FromStatus string         `json:"from_status,omitempty"`
	ToStatus   string         `json:"to_status,omitempty"`
	Comment    string         `json:"comment,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
}

type CreateTicketRequest struct {
	CustomerID  *int   `json:"customer_id"`
	CustomerName string `json:"customer_name"`
	MikrotikRef string `json:"mikrotik_ref"`
	ONUID       *int   `json:"onu_id"`
	RouterID    *int   `json:"router_id"`
	LocationODP string `json:"location_odp"`
	Category    string `json:"category"`
	Priority    string `json:"priority"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type AssignTicketRequest struct {
	AssignedTo int `json:"assigned_to"`
}

type UpdateStatusRequest struct {
	Status  string `json:"status"`
	Comment string `json:"comment"`
}

type AddCommentRequest struct {
	Comment string `json:"comment"`
}

type UpdateTicketRequest struct {
	Category    string `json:"category"`
	Priority    string `json:"priority"`
	Title       string `json:"title"`
	Description string `json:"description"`
	LocationODP string `json:"location_odp"`
}

type DuplicateCheckResult struct {
	HasDuplicate bool     `json:"has_duplicate"`
	Tickets      []Ticket `json:"tickets,omitempty"`
}

type TicketFilters struct {
	Status     string
	AssignedTo int
	Category   string
	Overdue    bool
}
