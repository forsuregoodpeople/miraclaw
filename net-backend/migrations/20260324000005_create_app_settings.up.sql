CREATE TABLE IF NOT EXISTS app_settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default GenieACS settings
INSERT INTO app_settings (key, value) VALUES
  ('genieacs.url',      'http://localhost:7557'),
  ('genieacs.username', ''),
  ('genieacs.password', '')
ON CONFLICT (key) DO NOTHING;
