CREATE TABLE mikrotik_dhcp_leases (
  id SERIAL PRIMARY KEY,
  router_id INTEGER NOT NULL,
  address VARCHAR(50) NOT NULL,
  mac_address VARCHAR(50) NOT NULL,
  host_name VARCHAR(100),
  client_id VARCHAR(100),
  server VARCHAR(100),
  status VARCHAR(20),
  expires_after VARCHAR(50),
  dynamic BOOLEAN DEFAULT TRUE,
  disabled BOOLEAN DEFAULT FALSE,
  active_address VARCHAR(50),
  active_mac VARCHAR(50),
  active_server VARCHAR(100),
  active_state BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dhcp_router FOREIGN KEY (router_id)
    REFERENCES mikrotik_routers(id) ON DELETE CASCADE
);

CREATE INDEX idx_dhcp_router_id ON mikrotik_dhcp_leases(router_id);
CREATE INDEX idx_dhcp_mac_address ON mikrotik_dhcp_leases(mac_address);
CREATE INDEX idx_dhcp_address ON mikrotik_dhcp_leases(address);
CREATE UNIQUE INDEX idx_dhcp_router_address ON mikrotik_dhcp_leases(router_id, address);
CREATE UNIQUE INDEX idx_dhcp_router_mac ON mikrotik_dhcp_leases(router_id, mac_address);
