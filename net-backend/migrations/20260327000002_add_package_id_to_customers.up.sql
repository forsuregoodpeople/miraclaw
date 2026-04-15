ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_package_id ON customers(package_id);
