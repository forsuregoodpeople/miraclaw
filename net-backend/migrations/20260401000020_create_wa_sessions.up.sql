CREATE TABLE IF NOT EXISTS wa_sessions (
    id              SERIAL PRIMARY KEY,
    mitra_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_name    VARCHAR(100) NOT NULL,
    gateway_url     VARCHAR(500) NOT NULL DEFAULT '',
    gateway_token   TEXT NOT NULL DEFAULT '',
    status          VARCHAR(20) NOT NULL DEFAULT 'disconnected', -- active | disconnected | banned
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_sessions_mitra ON wa_sessions(mitra_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sessions_mitra_name ON wa_sessions(mitra_id, session_name);
