-- Settings scoped per mitra (key=value pairs)
CREATE TABLE IF NOT EXISTS wa_settings (
    mitra_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         VARCHAR(100) NOT NULL,
    value       TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mitra_id, key)
);
