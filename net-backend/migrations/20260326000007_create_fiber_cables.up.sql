CREATE TABLE IF NOT EXISTS fiber_cables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL DEFAULT '',
  from_device_id INTEGER REFERENCES optical_devices(id) ON DELETE SET NULL,
  to_device_id INTEGER REFERENCES optical_devices(id) ON DELETE SET NULL,
  points JSONB NOT NULL DEFAULT '[]',
  cable_type VARCHAR(20) NOT NULL DEFAULT 'fiber' CHECK (cable_type IN ('fiber','drop','trunk')),
  color VARCHAR(20) NOT NULL DEFAULT '#f97316',
  length_m INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
