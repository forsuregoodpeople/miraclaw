CREATE TABLE IF NOT EXISTS wa_queue (
    id              SERIAL PRIMARY KEY,
    mitra_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      INTEGER REFERENCES wa_sessions(id) ON DELETE SET NULL,
    customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    invoice_id      INTEGER REFERENCES finance_invoices(id) ON DELETE SET NULL,
    wa_number       VARCHAR(20) NOT NULL,
    message         TEXT NOT NULL,
    trigger_type    VARCHAR(20) NOT NULL,  -- H-3 | H-1 | H0 | OVERDUE | MANUAL
    status          VARCHAR(10) NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
    retry_count     INTEGER NOT NULL DEFAULT 0,
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    error_msg       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_queue_mitra_status
    ON wa_queue(mitra_id, status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_queue_scheduled ON wa_queue(scheduled_at);

-- Prevent duplicate automated reminder for same invoice + trigger
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_queue_invoice_trigger
    ON wa_queue(invoice_id, trigger_type)
    WHERE status != 'failed' AND trigger_type != 'MANUAL';
