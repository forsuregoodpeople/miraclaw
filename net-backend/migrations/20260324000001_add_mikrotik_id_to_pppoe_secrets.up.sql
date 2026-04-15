-- Add mikrotik_id column to store RouterOS internal .id
ALTER TABLE mikrotik_pppoe_secrets ADD COLUMN mikrotik_id VARCHAR(50);

-- Create index for faster lookups by mikrotik_id
CREATE INDEX idx_pppoe_mikrotik_id ON mikrotik_pppoe_secrets(router_id, mikrotik_id);

-- Add last_synced_at column to track synchronization
ALTER TABLE mikrotik_pppoe_secrets ADD COLUMN last_synced_at TIMESTAMP;

-- Add sync_status column to track sync state
ALTER TABLE mikrotik_pppoe_secrets ADD COLUMN sync_status VARCHAR(20) DEFAULT 'pending';
