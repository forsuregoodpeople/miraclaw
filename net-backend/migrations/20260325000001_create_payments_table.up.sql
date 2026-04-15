CREATE TABLE IF NOT EXISTS finance_payments (
    id             SERIAL PRIMARY KEY,
    customer_id    VARCHAR(100) NOT NULL,
    customer_name  VARCHAR(255) NOT NULL,
    amount         NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH','TRANSFER','E-WALLET')),
    payment_date   TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period VARCHAR(7) NOT NULL,
    note           TEXT,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_billing_period ON finance_payments(billing_period);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON finance_payments(customer_id);
