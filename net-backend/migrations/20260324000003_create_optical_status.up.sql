CREATE TABLE optical_status (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES optical_devices(id) ON DELETE CASCADE,
  rx_power DOUBLE PRECISION,
  tx_power DOUBLE PRECISION,
  attenuation DOUBLE PRECISION,
  link_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
    CHECK (link_status IN ('up','down','degraded','unknown')),
  raw_response JSONB,
  polled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_optical_status_device_id ON optical_status(device_id);
CREATE INDEX idx_optical_status_polled_at ON optical_status(polled_at DESC);
