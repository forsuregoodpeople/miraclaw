package finance

import (
	"context"
	"fmt"
	"time"
)

type IFinanceService interface {
	GetPayments(ctx context.Context, period string) ([]Payment, error)
	CreatePayment(ctx context.Context, req CreatePaymentRequest) (*Payment, error)
	GetInvoices(ctx context.Context, period string, customerID int) ([]Invoice, error)
	CreateInvoice(ctx context.Context, req CreateInvoiceRequest) (*Invoice, error)
	CreateBulkInvoices(ctx context.Context, req BulkCreateInvoiceRequest) (BulkCreateInvoiceResult, error)
	DeletePayment(ctx context.Context, id int) error
	UpdatePayment(ctx context.Context, id int, req UpdatePaymentRequest) (*Payment, error)
	DeleteInvoice(ctx context.Context, id int) error
	UpdateInvoice(ctx context.Context, id int, req UpdateInvoiceRequest) (*Invoice, error)
	MarkInvoicePaid(ctx context.Context, id int) error
	AutoMarkInvoicePaid(ctx context.Context, customerID int, billingPeriod string) error
	GetSummary(ctx context.Context, period string) (*Summary, error)
	GetTariff(ctx context.Context, customerID int) (*Tariff, error)
	UpsertTariff(ctx context.Context, req UpsertTariffRequest) (*Tariff, error)
}

type FinanceService struct {
	repo IFinanceRepository
}

func NewService(repo IFinanceRepository) *FinanceService {
	return &FinanceService{repo: repo}
}

func (s *FinanceService) GetPayments(ctx context.Context, period string) ([]Payment, error) {
	return s.repo.GetPayments(ctx, period)
}

func (s *FinanceService) CreatePayment(ctx context.Context, req CreatePaymentRequest) (*Payment, error) {
	paymentDate, err := parseDateTime(req.PaymentDate)
	if err != nil {
		return nil, fmt.Errorf("invalid payment_date: %w", err)
	}

	p := &Payment{
		CustomerID:    req.CustomerID,
		CustomerName:  req.CustomerName,
		Amount:        req.Amount,
		PaymentMethod: req.PaymentMethod,
		PaymentDate:   paymentDate,
		BillingPeriod: req.BillingPeriod,
		Note:          req.Note,
		ReceiptPath:   req.ReceiptPath,
		RouterID:      req.RouterID,
	}

	if errs := p.Validate(); len(errs) > 0 {
		return nil, fmt.Errorf("validation failed")
	}

	if err := s.repo.CreatePayment(ctx, p); err != nil {
		return nil, err
	}
	if p.CustomerID > 0 {
		_ = s.repo.AutoMarkInvoicePaid(ctx, p.CustomerID, p.BillingPeriod)
	}
	return p, nil
}

func (s *FinanceService) AutoMarkInvoicePaid(ctx context.Context, customerID int, billingPeriod string) error {
	return s.repo.AutoMarkInvoicePaid(ctx, customerID, billingPeriod)
}

func (s *FinanceService) GetInvoices(ctx context.Context, period string, customerID int) ([]Invoice, error) {
	return s.repo.GetInvoices(ctx, period, customerID)
}

func (s *FinanceService) CreateInvoice(ctx context.Context, req CreateInvoiceRequest) (*Invoice, error) {
	dueDate, err := parseDateTime(req.DueDate)
	if err != nil {
		return nil, fmt.Errorf("invalid due_date: %w", err)
	}

	inv := &Invoice{
		CustomerID:    req.CustomerID,
		CustomerName:  req.CustomerName,
		AmountDue:     req.AmountDue,
		BillingPeriod: req.BillingPeriod,
		DueDate:       dueDate,
		Status:        "UNPAID",
		RouterID:      req.RouterID,
	}

	if errs := inv.Validate(); len(errs) > 0 {
		return nil, fmt.Errorf("validation failed")
	}

	if err := s.repo.CreateInvoice(ctx, inv); err != nil {
		return nil, err
	}
	return inv, nil
}

func (s *FinanceService) CreateBulkInvoices(ctx context.Context, req BulkCreateInvoiceRequest) (BulkCreateInvoiceResult, error) {
	if req.BillingPeriod == "" || req.DueDate == "" {
		return BulkCreateInvoiceResult{}, fmt.Errorf("billing_period and due_date are required")
	}
	dueDate, err := parseDateTime(req.DueDate)
	if err != nil {
		return BulkCreateInvoiceResult{}, fmt.Errorf("invalid due_date: %w", err)
	}

	items := make([]Invoice, 0, len(req.Items))
	for _, item := range req.Items {
		if item.CustomerID == 0 {
			continue
		}
		items = append(items, Invoice{
			CustomerID:    item.CustomerID,
			CustomerName:  item.CustomerName,
			AmountDue:     item.AmountDue,
			BillingPeriod: req.BillingPeriod,
			DueDate:       dueDate,
			Status:        "UNPAID",
			RouterID:      item.RouterID,
		})
	}
	if len(items) == 0 {
		return BulkCreateInvoiceResult{}, fmt.Errorf("no valid items provided")
	}

	result := s.repo.CreateBulkInvoices(ctx, items)
	return result, nil
}

func (s *FinanceService) DeletePayment(ctx context.Context, id int) error {
	return s.repo.DeletePayment(ctx, id)
}

func (s *FinanceService) UpdatePayment(ctx context.Context, id int, req UpdatePaymentRequest) (*Payment, error) {
	paymentDate, err := parseDateTime(req.PaymentDate)
	if err != nil {
		return nil, fmt.Errorf("invalid payment_date: %w", err)
	}
	req.PaymentDate = paymentDate.Format(time.RFC3339)
	return s.repo.UpdatePayment(ctx, id, req)
}

func (s *FinanceService) DeleteInvoice(ctx context.Context, id int) error {
	return s.repo.DeleteInvoice(ctx, id)
}

func (s *FinanceService) UpdateInvoice(ctx context.Context, id int, req UpdateInvoiceRequest) (*Invoice, error) {
	dueDate, err := parseDateTime(req.DueDate)
	if err != nil {
		return nil, fmt.Errorf("invalid due_date: %w", err)
	}
	req.DueDate = dueDate.Format(time.RFC3339)
	return s.repo.UpdateInvoice(ctx, id, req)
}

func (s *FinanceService) MarkInvoicePaid(ctx context.Context, id int) error {
	return s.repo.MarkInvoicePaid(ctx, id)
}

func (s *FinanceService) GetSummary(ctx context.Context, period string) (*Summary, error) {
	return s.repo.GetSummary(ctx, period)
}

func (s *FinanceService) GetTariff(ctx context.Context, customerID int) (*Tariff, error) {
	return s.repo.GetTariff(ctx, customerID)
}

func (s *FinanceService) UpsertTariff(ctx context.Context, req UpsertTariffRequest) (*Tariff, error) {
	return s.repo.UpsertTariff(ctx, req)
}

// parseDateTime tries RFC3339 first, falls back to date-only format.
func parseDateTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("date string is empty")
	}
	t, err := time.Parse(time.RFC3339, s)
	if err == nil {
		return t, nil
	}
	// Try truncated ISO (e.g. "2026-03-25T00:00:00.000Z" without timezone offset)
	t, err = time.Parse("2006-01-02T15:04:05.000Z", s)
	if err == nil {
		return t, nil
	}
	// Fallback: date only
	t, err = time.Parse("2006-01-02", s[:10])
	if err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("cannot parse date %q", s)
}
