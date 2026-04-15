DROP INDEX IF EXISTS uidx_invoices_customer_period;
ALTER TABLE finance_payments DROP COLUMN IF EXISTS router_id;
ALTER TABLE finance_invoices DROP COLUMN IF EXISTS router_id;
