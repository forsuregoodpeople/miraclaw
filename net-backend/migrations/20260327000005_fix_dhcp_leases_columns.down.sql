ALTER TABLE mikrotik_dhcp_leases
  DROP COLUMN comment;

ALTER TABLE mikrotik_dhcp_leases
  RENAME COLUMN is_isolir TO disabled;
