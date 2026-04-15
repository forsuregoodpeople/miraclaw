ALTER TABLE finance_payments ADD COLUMN IF NOT EXISTS router_id INTEGER;
ALTER TABLE finance_invoices ADD COLUMN IF NOT EXISTS router_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_invoices_customer_period
    ON finance_invoices(customer_id, billing_period);
