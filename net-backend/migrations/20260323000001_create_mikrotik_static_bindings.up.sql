CREATE TABLE mikrotik_static_bindings (
  id          SERIAL PRIMARY KEY,
  router_id   INTEGER      NOT NULL,
  address     VARCHAR(50)  NOT NULL DEFAULT '',
  mac_address VARCHAR(50)  NOT NULL,
  server      VARCHAR(100) NOT NULL DEFAULT '',
  type        VARCHAR(20)  NOT NULL DEFAULT 'regular',
  to_address  VARCHAR(50)  NOT NULL DEFAULT '',
  comment     TEXT         NOT NULL DEFAULT '',
  is_disabled BOOLEAN      NOT NULL DEFAULT FALSE,
  last_seen   VARCHAR(50)  NOT NULL DEFAULT 'never',
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_static_router FOREIGN KEY (router_id)
    REFERENCES mikrotik_routers(id) ON DELETE CASCADE
);

CREATE INDEX idx_static_router_id   ON mikrotik_static_bindings(router_id);
CREATE INDEX idx_static_address     ON mikrotik_static_bindings(address);
CREATE UNIQUE INDEX idx_static_router_mac ON mikrotik_static_bindings(router_id, mac_address);
