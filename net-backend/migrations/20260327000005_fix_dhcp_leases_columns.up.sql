DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mikrotik_dhcp_leases' AND column_name = 'disabled'
  ) THEN
    ALTER TABLE mikrotik_dhcp_leases RENAME COLUMN disabled TO is_isolir;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mikrotik_dhcp_leases' AND column_name = 'comment'
  ) THEN
    ALTER TABLE mikrotik_dhcp_leases ADD COLUMN comment VARCHAR(255) DEFAULT '';
  END IF;
END $$;
