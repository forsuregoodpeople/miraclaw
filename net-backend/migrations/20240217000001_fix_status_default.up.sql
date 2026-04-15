-- Remove default value from status column to prevent overriding with 'unknown'
ALTER TABLE mikrotik_routers ALTER COLUMN status DROP DEFAULT;

-- Update existing routers with unknown status to Pinging so they will be rechecked
UPDATE mikrotik_routers SET status = 'Pinging' WHERE status = 'unknown' AND is_active = true;
