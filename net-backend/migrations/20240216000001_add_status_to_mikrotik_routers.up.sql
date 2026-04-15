-- Add status column to mikrotik_routers table
ALTER TABLE mikrotik_routers ADD COLUMN status VARCHAR(20) DEFAULT 'unknown';

-- Update existing records to have default status
UPDATE mikrotik_routers SET status = 'unknown' WHERE status IS NULL;