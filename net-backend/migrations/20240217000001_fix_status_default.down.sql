-- Restore default value for status column (for rollback)
ALTER TABLE mikrotik_routers ALTER COLUMN status SET DEFAULT 'unknown';
