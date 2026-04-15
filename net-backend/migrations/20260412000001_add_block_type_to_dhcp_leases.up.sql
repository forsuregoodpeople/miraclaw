ALTER TABLE mikrotik_dhcp_leases
  ADD COLUMN IF NOT EXISTS block_type VARCHAR(10) NOT NULL DEFAULT 'none';

UPDATE mikrotik_dhcp_leases SET block_type = 'isolir' WHERE is_isolir = TRUE;
