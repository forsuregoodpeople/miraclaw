-- Add latitude and longitude columns to mikrotik_routers table
ALTER TABLE mikrotik_routers 
ADD COLUMN latitude DECIMAL(10, 8),
ADD COLUMN longitude DECIMAL(11, 8);

-- Add comment for documentation
COMMENT ON COLUMN mikrotik_routers.latitude IS 'Latitude coordinate for router location';
COMMENT ON COLUMN mikrotik_routers.longitude IS 'Longitude coordinate for router location';