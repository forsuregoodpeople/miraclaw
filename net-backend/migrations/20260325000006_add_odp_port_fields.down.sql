ALTER TABLE optical_devices
  DROP COLUMN IF EXISTS total_ports,
  DROP COLUMN IF EXISTS used_ports,
  DROP COLUMN IF EXISTS mikrotik_id,
  DROP COLUMN IF EXISTS technician_id,
  DROP COLUMN IF EXISTS photo_url;
