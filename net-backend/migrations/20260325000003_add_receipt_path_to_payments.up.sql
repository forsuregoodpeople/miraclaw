ALTER TABLE finance_payments
    ADD COLUMN IF NOT EXISTS receipt_path VARCHAR(500);
