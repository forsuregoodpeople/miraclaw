-- Reverse: rename customer_id (INTEGER FK) back to customer_fk, customer_ref back to customer_id
ALTER TABLE finance_customer_tariffs RENAME COLUMN customer_id  TO customer_fk;
ALTER TABLE finance_customer_tariffs RENAME COLUMN customer_ref TO customer_id;
ALTER TABLE finance_customer_tariffs DROP COLUMN customer_fk;

ALTER TABLE finance_invoices         RENAME COLUMN customer_id  TO customer_fk;
ALTER TABLE finance_invoices         RENAME COLUMN customer_ref TO customer_id;
ALTER TABLE finance_invoices         DROP COLUMN customer_fk;

ALTER TABLE finance_payments         RENAME COLUMN customer_id  TO customer_fk;
ALTER TABLE finance_payments         RENAME COLUMN customer_ref TO customer_id;
ALTER TABLE finance_payments         DROP COLUMN customer_fk;
