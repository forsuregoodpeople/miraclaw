CREATE TABLE IF NOT EXISTS tickets (
    id              SERIAL PRIMARY KEY,
    ticket_number   VARCHAR(20) NOT NULL UNIQUE,
    customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name   VARCHAR(255) NOT NULL,
    mikrotik_ref    VARCHAR(100),
    onu_id          INTEGER REFERENCES optical_devices(id) ON DELETE SET NULL,
    router_id       INTEGER REFERENCES mikrotik_routers(id) ON DELETE SET NULL,
    location_odp    VARCHAR(255),
    category        VARCHAR(50) NOT NULL
        CHECK (category IN ('INTERNET_DOWN','LOS','SLOW','NO_SIGNAL','HARDWARE','BILLING','OTHER')),
    priority        VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    title           VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED')),
    assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    sla_deadline    TIMESTAMPTZ NOT NULL,
    created_by      INTEGER NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status        ON tickets(status);
CREATE INDEX idx_tickets_customer_id   ON tickets(customer_id);
CREATE INDEX idx_tickets_assigned_to   ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_at    ON tickets(created_at DESC);
CREATE INDEX idx_tickets_sla_deadline  ON tickets(sla_deadline);
CREATE INDEX idx_tickets_mikrotik_ref  ON tickets(mikrotik_ref) WHERE mikrotik_ref IS NOT NULL;
