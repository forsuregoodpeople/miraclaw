-- Add nullable integer FK columns alongside the existing VARCHAR customer_id
ALTER TABLE finance_payments         ADD COLUMN customer_fk INTEGER REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE finance_invoices         ADD COLUMN customer_fk INTEGER REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE finance_customer_tariffs ADD COLUMN customer_fk INTEGER REFERENCES customers(id) ON DELETE CASCADE;

-- Rename: old VARCHAR column → customer_ref (kept for legacy display)
--         new INTEGER column → customer_id (the canonical FK going forward)
ALTER TABLE finance_payments         RENAME COLUMN customer_id TO customer_ref;
ALTER TABLE finance_payments         RENAME COLUMN customer_fk TO customer_id;

ALTER TABLE finance_invoices         RENAME COLUMN customer_id TO customer_ref;
ALTER TABLE finance_invoices         RENAME COLUMN customer_fk TO customer_id;

ALTER TABLE finance_customer_tariffs RENAME COLUMN customer_id TO customer_ref;
ALTER TABLE finance_customer_tariffs RENAME COLUMN customer_fk TO customer_id;
