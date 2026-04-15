CREATE TABLE IF NOT EXISTS finance_invoices (
    id             SERIAL PRIMARY KEY,
    customer_id    VARCHAR(100) NOT NULL,
    customer_name  VARCHAR(255) NOT NULL,
    amount_due     NUMERIC(15,2) NOT NULL CHECK (amount_due >= 0),
    billing_period VARCHAR(7) NOT NULL,
    due_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAID','OVERDUE')),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON finance_invoices(billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON finance_invoices(customer_id);
