CREATE TABLE mikrotik_pppoe_secrets (
  id SERIAL PRIMARY KEY,
  router_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL,
  profile VARCHAR(100),
  service VARCHAR(50) DEFAULT 'pppoe',
  local_address VARCHAR(50),
  remote_address VARCHAR(50),
  comment TEXT,
  disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pppoe_router FOREIGN KEY (router_id) 
    REFERENCES mikrotik_routers(id) ON DELETE CASCADE
);

CREATE INDEX idx_pppoe_router_id ON mikrotik_pppoe_secrets(router_id);
CREATE UNIQUE INDEX idx_pppoe_router_name ON mikrotik_pppoe_secrets(router_id, name);