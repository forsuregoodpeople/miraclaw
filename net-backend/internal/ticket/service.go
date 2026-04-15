package ticket

import (
	"context"
	"fmt"
	"time"
)

type ITicketService interface {
	CreateTicket(ctx context.Context, req CreateTicketRequest, actorID int, actorName string) (*Ticket, error)
	CheckDuplicate(ctx context.Context, customerID *int, mikrotikRef string) (*DuplicateCheckResult, error)
	GetTickets(ctx context.Context, filters TicketFilters) ([]Ticket, error)
	GetTicket(ctx context.Context, id int) (*Ticket, error)
	AssignTicket(ctx context.Context, id int, req AssignTicketRequest, actorID int, actorName string) error
	UpdateStatus(ctx context.Context, id int, req UpdateStatusRequest, actorID int, actorName string) error
	UpdateTicket(ctx context.Context, id int, req UpdateTicketRequest, actorID int, actorName string) (*Ticket, error)
	DeleteTicket(ctx context.Context, id int, actorID int, actorName string) error
	AddComment(ctx context.Context, id int, req AddCommentRequest, actorID int, actorName string) error
	GetTimeline(ctx context.Context, ticketID int) ([]TimelineEntry, error)
}

type TicketService struct {
	repo ITicketRepository
}

func NewService(repo ITicketRepository) *TicketService {
	return &TicketService{repo: repo}
}

func (s *TicketService) CreateTicket(ctx context.Context, req CreateTicketRequest, actorID int, actorName string) (*Ticket, error) {
	if err := validateCreateRequest(req); err != nil {
		return nil, err
	}

	date := time.Now().Format("20060102")
	seq, err := s.repo.GetNextSequence(ctx, date)
	if err != nil {
		return nil, fmt.Errorf("get sequence: %w", err)
	}

	slaDur, ok := SLADurations[req.Priority]
	if !ok {
		slaDur = SLADurations["MEDIUM"]
	}

	customerName := req.CustomerName
	if customerName == "" {
		customerName = "Tidak diketahui"
	}

	t := &Ticket{
		TicketNumber: fmt.Sprintf("TKT-%s-%04d", date, seq),
		CustomerID:   req.CustomerID,
		CustomerName: customerName,
		MikrotikRef:  req.MikrotikRef,
		ONUID:        req.ONUID,
		RouterID:     req.RouterID,
		LocationODP:  req.LocationODP,
		Category:     req.Category,
		Priority:     req.Priority,
		Title:        req.Title,
		Description:  req.Description,
		Status:       "OPEN",
		SLADeadline:  time.Now().Add(slaDur),
		CreatedBy:    actorID,
	}

	if err := s.repo.Create(ctx, t); err != nil {
		return nil, err
	}

	_ = s.repo.AddTimeline(ctx, &TimelineEntry{
		TicketID:  t.ID,
		ActorID:   actorID,
		ActorName: actorName,
		Action:    "CREATED",
		ToStatus:  "OPEN",
		Comment:   fmt.Sprintf("Tiket dibuat: %s", t.Title),
	})

	return t, nil
}

func (s *TicketService) CheckDuplicate(ctx context.Context, customerID *int, mikrotikRef string) (*DuplicateCheckResult, error) {
	tickets, err := s.repo.CheckDuplicate(ctx, customerID, mikrotikRef)
	if err != nil {
		return nil, err
	}
	return &DuplicateCheckResult{
		HasDuplicate: len(tickets) > 0,
		Tickets:      tickets,
	}, nil
}

func (s *TicketService) GetTickets(ctx context.Context, filters TicketFilters) ([]Ticket, error) {
	return s.repo.GetAll(ctx, filters)
}

func (s *TicketService) GetTicket(ctx context.Context, id int) (*Ticket, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *TicketService) AssignTicket(ctx context.Context, id int, req AssignTicketRequest, actorID int, actorName string) error {
	if req.AssignedTo <= 0 {
		return fmt.Errorf("assigned_to wajib diisi")
	}

	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if t.Status != "OPEN" {
		return fmt.Errorf("tiket hanya bisa di-assign saat status OPEN (status saat ini: %s)", t.Status)
	}

	if err := s.repo.Assign(ctx, id, req.AssignedTo, actorID); err != nil {
		return err
	}

	_ = s.repo.AddTimeline(ctx, &TimelineEntry{
		TicketID:   id,
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     "ASSIGNED",
		FromStatus: "OPEN",
		ToStatus:   "ASSIGNED",
		Metadata:   map[string]any{"assigned_to": req.AssignedTo},
	})

	return nil
}

func (s *TicketService) UpdateStatus(ctx context.Context, id int, req UpdateStatusRequest, actorID int, actorName string) error {
	if req.Status == "" {
		return fmt.Errorf("status wajib diisi")
	}

	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	allowed := AllowedTransitions[t.Status]
	valid := false
	for _, a := range allowed {
		if a == req.Status {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("transisi status %s → %s tidak diizinkan", t.Status, req.Status)
	}

	if err := s.repo.UpdateStatus(ctx, id, req.Status); err != nil {
		return err
	}
	if req.Status == "RESOLVED" {
		_ = s.repo.SetResolvedAt(ctx, id)
	}
	if req.Status == "CLOSED" {
		_ = s.repo.SetClosedAt(ctx, id)
	}

	_ = s.repo.AddTimeline(ctx, &TimelineEntry{
		TicketID:   id,
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     "STATUS_CHANGED",
		FromStatus: t.Status,
		ToStatus:   req.Status,
		Comment:    req.Comment,
	})

	return nil
}

func (s *TicketService) UpdateTicket(ctx context.Context, id int, req UpdateTicketRequest, actorID int, actorName string) (*Ticket, error) {
	if len(req.Title) < 5 {
		return nil, fmt.Errorf("judul minimal 5 karakter")
	}
	if len(req.Description) < 10 {
		return nil, fmt.Errorf("deskripsi minimal 10 karakter")
	}
	validCategories := map[string]bool{
		"INTERNET_DOWN": true, "LOS": true, "SLOW": true,
		"NO_SIGNAL": true, "HARDWARE": true, "BILLING": true, "OTHER": true,
	}
	if !validCategories[req.Category] {
		return nil, fmt.Errorf("kategori tidak valid")
	}
	if _, ok := SLADurations[req.Priority]; !ok {
		return nil, fmt.Errorf("prioritas tidak valid")
	}

	if err := s.repo.Update(ctx, id, req); err != nil {
		return nil, err
	}

	_ = s.repo.AddTimeline(ctx, &TimelineEntry{
		TicketID:  id,
		ActorID:   actorID,
		ActorName: actorName,
		Action:    "FIELD_UPDATED",
		Comment:   fmt.Sprintf("Tiket diperbarui oleh %s", actorName),
	})

	return s.repo.GetByID(ctx, id)
}

func (s *TicketService) DeleteTicket(ctx context.Context, id int, actorID int, actorName string) error {
	if _, err := s.repo.GetByID(ctx, id); err != nil {
		return err
	}
	return s.repo.Delete(ctx, id)
}

func (s *TicketService) AddComment(ctx context.Context, id int, req AddCommentRequest, actorID int, actorName string) error {
	if req.Comment == "" {
		return fmt.Errorf("komentar tidak boleh kosong")
	}

	// verify ticket exists
	if _, err := s.repo.GetByID(ctx, id); err != nil {
		return err
	}

	return s.repo.AddTimeline(ctx, &TimelineEntry{
		TicketID:  id,
		ActorID:   actorID,
		ActorName: actorName,
		Action:    "COMMENT",
		Comment:   req.Comment,
	})
}

func (s *TicketService) GetTimeline(ctx context.Context, ticketID int) ([]TimelineEntry, error) {
	return s.repo.GetTimeline(ctx, ticketID)
}

func validateCreateRequest(req CreateTicketRequest) error {
	if req.CustomerID == nil && req.MikrotikRef == "" {
		return fmt.Errorf("customer_id atau mikrotik_ref wajib diisi")
	}
	if len(req.Title) < 5 {
		return fmt.Errorf("judul minimal 5 karakter")
	}
	if len(req.Description) < 10 {
		return fmt.Errorf("deskripsi minimal 10 karakter")
	}
	validCategories := map[string]bool{
		"INTERNET_DOWN": true, "LOS": true, "SLOW": true,
		"NO_SIGNAL": true, "HARDWARE": true, "BILLING": true, "OTHER": true,
	}
	if !validCategories[req.Category] {
		return fmt.Errorf("kategori tidak valid")
	}
	if _, ok := SLADurations[req.Priority]; !ok {
		return fmt.Errorf("prioritas tidak valid")
	}
	return nil
}
