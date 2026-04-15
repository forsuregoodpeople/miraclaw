-- Drop old WA tables (gateway-based approach)
DROP TABLE IF EXISTS wa_queue;
DROP TABLE IF EXISTS wa_settings;
DROP TABLE IF EXISTS wa_sessions;

-- Sessions: one per mitra, managed by whatsapp-web.js (LocalAuth)
CREATE TABLE wa_sessions (
    id SERIAL PRIMARY KEY,
    mitra_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    session_name VARCHAR(100) NOT NULL DEFAULT 'default',
    status VARCHAR(20) NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | connected | banned
    auth_data_path TEXT,          -- path where whatsapp-web.js stores LocalAuth session files
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_sessions_mitra ON wa_sessions (mitra_id);

-- Queue: outgoing messages for billing reminders and manual sends
CREATE TABLE wa_queue (
    id SERIAL PRIMARY KEY,
    mitra_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    invoice_id INTEGER REFERENCES finance_invoices(id) ON DELETE SET NULL,
    wa_number VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL', -- H-3 | H-1 | H0 | OVERDUE | MANUAL
    status VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending | sent | failed | skipped
    retry_count INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    error_msg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate automated reminders for the same invoice+trigger
CREATE UNIQUE INDEX idx_wa_queue_invoice_trigger
    ON wa_queue (invoice_id, trigger_type)
    WHERE invoice_id IS NOT NULL AND trigger_type <> 'MANUAL';

-- Fast lookup for pending messages per mitra
CREATE INDEX idx_wa_queue_mitra_pending ON wa_queue (mitra_id, scheduled_at)
    WHERE status = 'pending';

-- Settings: per-mitra key-value config (enabled, rate limits, templates)
CREATE TABLE wa_settings (
    mitra_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mitra_id, key)
);
