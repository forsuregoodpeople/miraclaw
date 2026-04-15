CREATE TABLE optical_alerts (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES optical_devices(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL
    CHECK (alert_type IN ('rx_below_threshold','odp_fault_suspected','device_unreachable','tx_below_threshold')),
  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  rx_power DOUBLE PRECISION,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_optical_alerts_device_id ON optical_alerts(device_id);
CREATE INDEX idx_optical_alerts_resolved_at ON optical_alerts(resolved_at);
CREATE UNIQUE INDEX idx_optical_alerts_active_dedup
  ON optical_alerts(device_id, alert_type)
  WHERE resolved_at IS NULL;
