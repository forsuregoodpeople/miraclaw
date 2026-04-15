-- Remove latitude and longitude columns from mikrotik_routers table
ALTER TABLE mikrotik_routers 
DROP COLUMN latitude,
DROP COLUMN longitude;