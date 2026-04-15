-- Users lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Customers lookup indexes
CREATE INDEX IF NOT EXISTS idx_customers_router_id ON customers(router_id);
CREATE INDEX IF NOT EXISTS idx_customers_package_id ON customers(package_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

-- WhatsApp queue indexes for worker processing
CREATE INDEX IF NOT EXISTS idx_wa_queue_status_scheduled ON wa_queue(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_queue_mitra_id ON wa_queue(mitra_id);

-- Finance indexes
CREATE INDEX IF NOT EXISTS idx_finance_invoices_customer_id ON finance_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_finance_invoices_billing_period ON finance_invoices(billing_period);
-- Note: finance_payments tidak memiliki kolom invoice_id, index dihapus
