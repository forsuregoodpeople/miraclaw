-- Remove added columns
ALTER TABLE mikrotik_pppoe_secrets DROP COLUMN IF EXISTS mikrotik_id;
ALTER TABLE mikrotik_pppoe_secrets DROP COLUMN IF EXISTS last_synced_at;
ALTER TABLE mikrotik_pppoe_secrets DROP COLUMN IF EXISTS sync_status;

-- Drop index
DROP INDEX IF EXISTS idx_pppoe_mikrotik_id;
