CREATE TABLE IF NOT EXISTS packages (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,
    connection_type       VARCHAR(10)  NOT NULL CHECK (connection_type IN ('PPPOE','DHCP','STATIC')),
    router_id             INTEGER      NOT NULL REFERENCES mikrotik_routers(id) ON DELETE CASCADE,
    mikrotik_profile_name VARCHAR(255) NOT NULL,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_router_type_profile
    ON packages(router_id, connection_type, mikrotik_profile_name)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_packages_router_id ON packages(router_id);
CREATE INDEX IF NOT EXISTS idx_packages_connection_type ON packages(connection_type);
