CREATE TABLE IF NOT EXISTS finance_customer_tariffs (
    id          SERIAL PRIMARY KEY,
    customer_id VARCHAR(100) NOT NULL,
    monthly_fee NUMERIC(15,2) NOT NULL CHECK (monthly_fee >= 0),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tariff_customer UNIQUE (customer_id)
);
