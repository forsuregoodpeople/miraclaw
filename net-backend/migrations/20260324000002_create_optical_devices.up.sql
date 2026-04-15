CREATE TABLE optical_devices (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('olt','odp','onu')),
  serial VARCHAR(100) UNIQUE,
  genieacs_id VARCHAR(255) UNIQUE,
  odp_id INTEGER REFERENCES optical_devices(id) ON DELETE SET NULL,
  ip_address VARCHAR(50),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  vendor VARCHAR(50),
  rx_param_path VARCHAR(255),
  tx_param_path VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_optical_devices_type ON optical_devices(device_type);
CREATE INDEX idx_optical_devices_odp_id ON optical_devices(odp_id);
CREATE INDEX idx_optical_devices_active ON optical_devices(is_active);
