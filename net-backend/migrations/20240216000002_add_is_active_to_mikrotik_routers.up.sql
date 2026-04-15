-- Add is_active column to mikrotik_routers table
ALTER TABLE mikrotik_routers ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Update existing records to have default active status
UPDATE mikrotik_routers SET is_active = true WHERE is_active IS NULL;