CREATE TABLE IF NOT EXISTS package_sync_log (
    id              SERIAL PRIMARY KEY,
    package_id      INTEGER     NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL CHECK (status IN ('ok','mismatch','missing')),
    mikrotik_actual VARCHAR(255),
    stored_value    VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_package_sync_log_package_id ON package_sync_log(package_id);
CREATE INDEX IF NOT EXISTS idx_package_sync_log_checked_at ON package_sync_log(checked_at DESC);
