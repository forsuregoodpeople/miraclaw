ALTER TABLE packages
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS last_synced_at;
