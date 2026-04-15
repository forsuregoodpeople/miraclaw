DROP INDEX IF EXISTS idx_customers_email;

ALTER TABLE customers
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS wa_number;
