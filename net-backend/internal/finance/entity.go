package finance

import (
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/net-backend/pkg"
)

type Payment struct {
	ID            int       `json:"id"`
	CustomerID    int       `json:"customer_id"`
	CustomerName  string    `json:"customer_name"  validate:"required"`
	Amount        float64   `json:"amount"         validate:"required,gt=0"`
	PaymentMethod string    `json:"payment_method" validate:"required,oneof=CASH TRANSFER E-WALLET"`
	PaymentDate   time.Time `json:"payment_date"`
	BillingPeriod string    `json:"billing_period" validate:"required"`
	Note          string    `json:"note,omitempty"`
	ReceiptPath   string    `json:"receipt_path,omitempty"`
	RouterID      int       `json:"router_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

func (p *Payment) Validate() []pkg.ValidationError {
	return pkg.ParseValidate(validator.New().Struct(p))
}

type Invoice struct {
	ID            int       `json:"id"`
	CustomerID    int       `json:"customer_id"`
	CustomerName  string    `json:"customer_name"  validate:"required"`
	AmountDue     float64   `json:"amount_due"     validate:"gte=0"`
	BillingPeriod string    `json:"billing_period" validate:"required"`
	DueDate       time.Time `json:"due_date"`
	Status        string    `json:"status"`
	RouterID      int       `json:"router_id,omitempty"`
	PackageID     *int      `json:"package_id,omitempty"`
	PackageName   string    `json:"package_name,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

func (i *Invoice) Validate() []pkg.ValidationError {
	return pkg.ParseValidate(validator.New().Struct(i))
}

type Summary struct {
	Period           string  `json:"period"`
	TotalRevenue     float64 `json:"total_revenue"`
	TotalInvoiced    float64 `json:"total_invoiced"`
	TotalPaid        float64 `json:"total_paid"`
	TotalOutstanding float64 `json:"total_outstanding"`
	PaymentCount     int     `json:"payment_count"`
	InvoiceCount     int     `json:"invoice_count"`
}

// CreatePaymentRequest is the body parsed from POST /v1/finance/payments (multipart)
type CreatePaymentRequest struct {
	CustomerID    int     `json:"customer_id"`
	CustomerName  string  `json:"customer_name"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	PaymentDate   string  `json:"payment_date"`   // ISO 8601 from frontend
	BillingPeriod string  `json:"billing_period"` // YYYY-MM
	Note          string  `json:"note"`
	ReceiptPath   string  `json:"-"` // set by handler after saving the file
	RouterID      int     `json:"router_id"`
}

// CreateInvoiceRequest is the body parsed from POST /v1/finance/invoices
type CreateInvoiceRequest struct {
	CustomerID    int     `json:"customer_id"`
	CustomerName  string  `json:"customer_name"`
	AmountDue     float64 `json:"amount_due"`
	BillingPeriod string  `json:"billing_period"`
	DueDate       string  `json:"due_date"` // ISO 8601 from frontend
	RouterID      int     `json:"router_id"`
}

// UpdatePaymentRequest is the body parsed from PUT /v1/finance/payments/:id
type UpdatePaymentRequest struct {
	CustomerName  string  `json:"customer_name"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	PaymentDate   string  `json:"payment_date"`
	BillingPeriod string  `json:"billing_period"`
	Note          string  `json:"note"`
}

// UpdateInvoiceRequest is the body parsed from PUT /v1/finance/invoices/:id
type UpdateInvoiceRequest struct {
	CustomerName  string  `json:"customer_name"`
	AmountDue     float64 `json:"amount_due"`
	BillingPeriod string  `json:"billing_period"`
	DueDate       string  `json:"due_date"`
	Status        string  `json:"status"`
}

// BulkCreateInvoiceRequest is the body parsed from POST /v1/finance/invoices/bulk
type BulkCreateInvoiceRequest struct {
	Items         []CreateInvoiceRequest `json:"items"`
	BillingPeriod string                 `json:"billing_period"`
	DueDate       string                 `json:"due_date"`
}

// BulkCreateInvoiceResult summarises a bulk creation attempt.
type BulkCreateInvoiceResult struct {
	Created int      `json:"created"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

// Tariff stores the monthly fee for a specific customer.
type Tariff struct {
	ID         int       `json:"id"`
	CustomerID int       `json:"customer_id"`
	MonthlyFee float64   `json:"monthly_fee"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// UpsertTariffRequest is the body parsed from PUT /v1/finance/tariff
type UpsertTariffRequest struct {
	CustomerID int     `json:"customer_id"`
	MonthlyFee float64 `json:"monthly_fee"`
}
