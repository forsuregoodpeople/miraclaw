CREATE TABLE IF NOT EXISTS customers (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    type         VARCHAR(10)  NOT NULL CHECK (type IN ('PPPOE','DHCP','STATIC')),
    router_id    INTEGER REFERENCES mikrotik_routers(id) ON DELETE SET NULL,
    mikrotik_ref VARCHAR(100),
    phone        VARCHAR(50),
    address      TEXT,
    note         TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_mikrotik_ref ON customers(mikrotik_ref) WHERE mikrotik_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_router_id ON customers(router_id);
