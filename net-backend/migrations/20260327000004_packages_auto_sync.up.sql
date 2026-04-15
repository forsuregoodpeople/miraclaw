-- Add auto-sync metadata to packages table.
-- source: 'auto' = created by profile sync, 'manual' = admin-created (legacy)
-- last_synced_at: timestamp of the last successful profile pull from MikroTik

ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS source        VARCHAR(10)  NOT NULL DEFAULT 'manual'
        CHECK (source IN ('auto','manual')),
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
