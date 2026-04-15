package finance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/lib/pq"
)

type IFinanceRepository interface {
	GetPayments(ctx context.Context, period string) ([]Payment, error)
	CreatePayment(ctx context.Context, p *Payment) error
	DeletePayment(ctx context.Context, id int) error
	UpdatePayment(ctx context.Context, id int, req UpdatePaymentRequest) (*Payment, error)
	GetInvoices(ctx context.Context, period string, customerID int) ([]Invoice, error)
	CreateInvoice(ctx context.Context, inv *Invoice) error
	CreateBulkInvoices(ctx context.Context, items []Invoice) BulkCreateInvoiceResult
	DeleteInvoice(ctx context.Context, id int) error
	UpdateInvoice(ctx context.Context, id int, req UpdateInvoiceRequest) (*Invoice, error)
	MarkInvoicePaid(ctx context.Context, id int) error
	AutoMarkInvoicePaid(ctx context.Context, customerID int, billingPeriod string) error
	GetSummary(ctx context.Context, period string) (*Summary, error)
	GetTariff(ctx context.Context, customerID int) (*Tariff, error)
	UpsertTariff(ctx context.Context, req UpsertTariffRequest) (*Tariff, error)
}

type FinanceRepository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *FinanceRepository {
	return &FinanceRepository{db: db}
}

func (r *FinanceRepository) GetPayments(ctx context.Context, period string) ([]Payment, error) {
	query := `
		SELECT id, COALESCE(customer_id, 0), customer_name, amount, payment_method,
		       payment_date, billing_period, COALESCE(note, ''), COALESCE(receipt_path, ''),
		       COALESCE(router_id, 0), created_at
		FROM finance_payments
		WHERE ($1 = '' OR billing_period = $1)
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, period)
	if err != nil {
		return nil, fmt.Errorf("GetPayments query: %w", err)
	}
	defer rows.Close()

	var payments []Payment
	for rows.Next() {
		var p Payment
		if err := rows.Scan(
			&p.ID, &p.CustomerID, &p.CustomerName, &p.Amount, &p.PaymentMethod,
			&p.PaymentDate, &p.BillingPeriod, &p.Note, &p.ReceiptPath, &p.RouterID, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("GetPayments scan: %w", err)
		}
		payments = append(payments, p)
	}
	if payments == nil {
		payments = []Payment{}
	}
	return payments, rows.Err()
}

func (r *FinanceRepository) CreatePayment(ctx context.Context, p *Payment) error {
	query := `
		INSERT INTO finance_payments
		    (customer_ref, customer_id, customer_name, amount, payment_method, payment_date, billing_period, note, receipt_path, router_id)
		VALUES ($1::TEXT, NULLIF($2, 0), $3, $4, $5, $6, $7, $8, NULLIF($9, ''), NULLIF($10, 0))
		RETURNING id, created_at`

	return r.db.QueryRowContext(ctx, query,
		p.CustomerID, p.CustomerID, p.CustomerName, p.Amount, p.PaymentMethod,
		p.PaymentDate, p.BillingPeriod, p.Note, p.ReceiptPath, p.RouterID,
	).Scan(&p.ID, &p.CreatedAt)
}

func (r *FinanceRepository) GetInvoices(ctx context.Context, period string, customerID int) ([]Invoice, error) {
	query := `
		SELECT fi.id, COALESCE(fi.customer_id, 0), fi.customer_name, fi.amount_due,
		       fi.billing_period, fi.due_date, fi.status, COALESCE(fi.router_id, 0),
		       c.package_id, COALESCE(p.name, ''), fi.created_at
		FROM finance_invoices fi
		LEFT JOIN customers c ON c.id = fi.customer_id
		LEFT JOIN packages p ON p.id = c.package_id
		WHERE ($1 = '' OR fi.billing_period = $1)
		  AND ($2 = 0 OR fi.customer_id = $2)
		ORDER BY fi.created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, period, customerID)
	if err != nil {
		return nil, fmt.Errorf("GetInvoices query: %w", err)
	}
	defer rows.Close()

	var invoices []Invoice
	for rows.Next() {
		var inv Invoice
		if err := rows.Scan(
			&inv.ID, &inv.CustomerID, &inv.CustomerName, &inv.AmountDue,
			&inv.BillingPeriod, &inv.DueDate, &inv.Status, &inv.RouterID,
			&inv.PackageID, &inv.PackageName, &inv.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("GetInvoices scan: %w", err)
		}
		invoices = append(invoices, inv)
	}
	if invoices == nil {
		invoices = []Invoice{}
	}
	return invoices, rows.Err()
}

func (r *FinanceRepository) CreateBulkInvoices(ctx context.Context, items []Invoice) BulkCreateInvoiceResult {
	result := BulkCreateInvoiceResult{}
	for i := range items {
		err := r.CreateInvoice(ctx, &items[i])
		if err != nil {
			if isUniqueViolation(err) {
				result.Skipped++
			} else {
				result.Errors = append(result.Errors, err.Error())
			}
		} else {
			result.Created++
		}
	}
	return result
}

func (r *FinanceRepository) CreateInvoice(ctx context.Context, inv *Invoice) error {
	query := `
		INSERT INTO finance_invoices
		    (customer_ref, customer_id, customer_name, amount_due, billing_period, due_date, status, router_id)
		VALUES ($1::TEXT, NULLIF($2, 0), $3, $4, $5, $6, 'UNPAID', NULLIF($7, 0))
		RETURNING id, status, created_at`

	err := r.db.QueryRowContext(ctx, query,
		inv.CustomerID, inv.CustomerID, inv.CustomerName, inv.AmountDue, inv.BillingPeriod, inv.DueDate, inv.RouterID,
	).Scan(&inv.ID, &inv.Status, &inv.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("tagihan untuk pelanggan ini pada periode %s sudah ada", inv.BillingPeriod)
		}
		return err
	}
	return nil
}

func (r *FinanceRepository) AutoMarkInvoicePaid(ctx context.Context, customerID int, billingPeriod string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE finance_invoices SET status = 'PAID'
		 WHERE customer_id = $1 AND billing_period = $2 AND status != 'PAID'`,
		customerID, billingPeriod,
	)
	return err
}

func (r *FinanceRepository) DeletePayment(ctx context.Context, id int) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM finance_payments WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("DeletePayment: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("payment not found")
	}
	return nil
}

func (r *FinanceRepository) DeleteInvoice(ctx context.Context, id int) error {
	res, err := r.db.ExecContext(ctx, `DELETE FROM finance_invoices WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("DeleteInvoice: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("invoice not found")
	}
	return nil
}

func (r *FinanceRepository) UpdatePayment(ctx context.Context, id int, req UpdatePaymentRequest) (*Payment, error) {
	p := &Payment{}
	err := r.db.QueryRowContext(ctx, `
		UPDATE finance_payments
		SET customer_name=$1, amount=$2, payment_method=$3, payment_date=$4, billing_period=$5, note=$6
		WHERE id=$7
		RETURNING id, COALESCE(customer_id,0), customer_name, amount, payment_method, payment_date,
		          billing_period, COALESCE(note,''), COALESCE(receipt_path,''), COALESCE(router_id,0), created_at`,
		req.CustomerName, req.Amount, req.PaymentMethod, req.PaymentDate, req.BillingPeriod, req.Note, id,
	).Scan(
		&p.ID, &p.CustomerID, &p.CustomerName, &p.Amount, &p.PaymentMethod, &p.PaymentDate,
		&p.BillingPeriod, &p.Note, &p.ReceiptPath, &p.RouterID, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("payment not found")
		}
		return nil, fmt.Errorf("UpdatePayment: %w", err)
	}
	return p, nil
}

func (r *FinanceRepository) UpdateInvoice(ctx context.Context, id int, req UpdateInvoiceRequest) (*Invoice, error) {
	inv := &Invoice{}
	err := r.db.QueryRowContext(ctx, `
		UPDATE finance_invoices
		SET customer_name=$1, amount_due=$2, billing_period=$3, due_date=$4, status=$5
		WHERE id=$6
		RETURNING id, COALESCE(customer_id,0), customer_name, amount_due, billing_period, due_date,
		          status, COALESCE(router_id,0), created_at`,
		req.CustomerName, req.AmountDue, req.BillingPeriod, req.DueDate, req.Status, id,
	).Scan(
		&inv.ID, &inv.CustomerID, &inv.CustomerName, &inv.AmountDue, &inv.BillingPeriod,
		&inv.DueDate, &inv.Status, &inv.RouterID, &inv.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("invoice not found")
		}
		return nil, fmt.Errorf("UpdateInvoice: %w", err)
	}
	return inv, nil
}

func (r *FinanceRepository) MarkInvoicePaid(ctx context.Context, id int) error {
	result, err := r.db.ExecContext(ctx,
		`UPDATE finance_invoices SET status = 'PAID' WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("MarkInvoicePaid: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("invoice %d not found", id)
	}
	return nil
}

func (r *FinanceRepository) GetSummary(ctx context.Context, period string) (*Summary, error) {
	s := &Summary{Period: period}

	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM finance_payments WHERE ($1 = '' OR billing_period = $1)`,
		period,
	).Scan(&s.TotalRevenue, &s.PaymentCount)
	if err != nil {
		return nil, fmt.Errorf("GetSummary payments: %w", err)
	}

	err = r.db.QueryRowContext(ctx,
		`SELECT
		    COALESCE(SUM(amount_due), 0),
		    COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_due ELSE 0 END), 0),
		    COALESCE(SUM(CASE WHEN status != 'PAID' THEN amount_due ELSE 0 END), 0),
		    COUNT(*)
		 FROM finance_invoices WHERE ($1 = '' OR billing_period = $1)`,
		period,
	).Scan(&s.TotalInvoiced, &s.TotalPaid, &s.TotalOutstanding, &s.InvoiceCount)
	if err != nil {
		return nil, fmt.Errorf("GetSummary invoices: %w", err)
	}

	return s, nil
}

func (r *FinanceRepository) GetTariff(ctx context.Context, customerID int) (*Tariff, error) {
	t := &Tariff{}
	err := r.db.QueryRowContext(ctx,
		`SELECT id, COALESCE(customer_id, 0), monthly_fee, updated_at FROM finance_customer_tariffs WHERE customer_id = $1`,
		customerID,
	).Scan(&t.ID, &t.CustomerID, &t.MonthlyFee, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("tariff not found")
		}
		return nil, fmt.Errorf("GetTariff: %w", err)
	}
	return t, nil
}

func (r *FinanceRepository) UpsertTariff(ctx context.Context, req UpsertTariffRequest) (*Tariff, error) {
	t := &Tariff{}
	err := r.db.QueryRowContext(ctx,
		`INSERT INTO finance_customer_tariffs (customer_id, monthly_fee)
		 VALUES ($1, $2)
		 ON CONFLICT (customer_id) DO UPDATE SET monthly_fee = $2, updated_at = NOW()
		 RETURNING id, COALESCE(customer_id, 0), monthly_fee, updated_at`,
		req.CustomerID, req.MonthlyFee,
	).Scan(&t.ID, &t.CustomerID, &t.MonthlyFee, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("UpsertTariff: %w", err)
	}
	return t, nil
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}
