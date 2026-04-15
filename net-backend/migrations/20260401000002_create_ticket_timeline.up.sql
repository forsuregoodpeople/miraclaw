CREATE TABLE IF NOT EXISTS ticket_timeline (
    id          SERIAL PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id    INTEGER NOT NULL REFERENCES users(id),
    actor_name  VARCHAR(255) NOT NULL,
    action      VARCHAR(50) NOT NULL
        CHECK (action IN ('CREATED','STATUS_CHANGED','ASSIGNED','COMMENT','FIELD_UPDATED')),
    from_status VARCHAR(20),
    to_status   VARCHAR(20),
    comment     TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timeline_ticket_id  ON ticket_timeline(ticket_id);
CREATE INDEX idx_timeline_created_at ON ticket_timeline(created_at DESC);
