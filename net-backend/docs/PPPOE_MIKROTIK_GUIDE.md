# MikroTik PPPoE Management Guide

## Understanding MikroTik `.id` vs Database ID

### The Root Cause of "no such item" Errors

MikroTik RouterOS uses internal `.id` values (like `*1`, `*2`, `*3`) to uniquely identify items. These are **NOT** the same as:
- Your database auto-increment ID
- The PPPoE username (name field)
- Any other human-readable identifier

### Key Differences

| Identifier | Example | Source | Usage |
|------------|---------|--------|-------|
| Database ID | `1`, `2`, `3` | PostgreSQL auto-increment | Internal reference |
| MikroTik `.id` | `*1`, `*2`, `*a1` | RouterOS internal | API operations |
| PPPoE Name | `user123` | User-defined | Login credential |

## MikroTik API Query Examples

### 1. Get PPPoE Secrets with `.id`

```bash
# Using routeros-api command line
/ppp/secret/print
=.proplist=.id,name,profile,service,disabled

# Response format:
!re
=.id=*1
=name=user1
=profile=default
=service=pppoe
=disabled=false

!re
=.id=*2
=name=user2
=profile=premium
=service=pppoe
=disabled=false

!done
```

### 2. Get Specific Secret by Name (to find `.id`)

```bash
/ppp/secret/print
?name=user1
=.proplist=.id,name,profile

# Alternative: Use query operator
/ppp/secret/print
?=name=user1
```

### 3. Update Secret (MUST use `.id`)

```bash
# CORRECT: Use MikroTik .id
/ppp/secret/set
=.id=*1
=password=newpassword
=profile=newprofile

# WRONG: Using name as .id will fail!
/ppp/secret/set
=.id=user1    # ERROR: no such item
=password=newpassword
```

### 4. Delete Secret (MUST use `.id`)

```bash
# CORRECT: Use MikroTik .id
/ppp/secret/remove
=.id=*1

# WRONG: Using name will fail!
/ppp/secret/remove
=.id=user1    # ERROR: no such item
```

### 5. Get Active PPPoE Sessions

```bash
/ppp/active/print
=.proplist=.id,name,address,caller-id,uptime,bytes-in,bytes-out

# Response:
!re
=.id=*1A
=name=user1
=address=192.168.1.100
=caller-id=00:11:22:33:44:55
=uptime=1h23m45s
=bytes-in=1048576
=bytes-out=2097152
```

### 6. Disconnect Active Session (MUST use `.id`)

```bash
# First, find the session .id
/ppp/active/print
?name=user1
=.proplist=.id,name

# Then disconnect using .id
/ppp/active/remove
=.id=*1A
```

## Best Practices for PPPoE Management

### 1. Always Store MikroTik `.id`

When creating a secret, immediately fetch and store the `.id`:

```go
// 1. Create secret on MikroTik
args := []string{"/ppp/secret/add",
    "=name=" + secret.Name,
    "=password=" + secret.Password,
    "=profile=" + secret.Profile,
}
reply, err := conn.Run(args...)

// 2. Fetch the .id by querying the secret
reply, err = conn.Run("/ppp/secret/print",
    "?name=" + secret.Name,
    "=.proplist=.id,name")

// 3. Store in database
mikrotikID := reply.Re[0].Map[".id"]
secret.MikrotikID = mikrotikID
```

### 2. Handle Missing Items Gracefully

```go
func isMikrotikNotFoundError(err error) bool {
    if err == nil {
        return false
    }
    errStr := strings.ToLower(err.Error())
    return strings.Contains(errStr, "no such item") ||
           strings.Contains(errStr, "not found")
}

// Usage in delete:
reply, err := conn.Run("/ppp/secret/remove", "=.id="+mikrotikID)
if err != nil {
    if isMikrotikNotFoundError(err) {
        // Already deleted, just remove from database
        return repo.Delete(ctx, id)
    }
    return err
}
```

### 3. Synchronization Strategy

Implement a sync endpoint to reconcile database with MikroTik:

```go
// POST /v1/mikrotik/{routerId}/pppoe/sync
func SyncSecrets(ctx context.Context, routerID int) error {
    // 1. Fetch all secrets from MikroTik
    reply, err := conn.Run("/ppp/secret/print",
        "=.proplist=.id,name,password,profile,service,disabled")
    
    // 2. Update database
    for _, re := range reply.Re {
        secret := Secret{
            MikrotikID: re.Map[".id"],
            Name:       re.Map["name"],
            // ... other fields
        }
        repo.Upsert(ctx, routerID, secret)
    }
    
    // 3. Mark secrets not in MikroTik as "not_found"
    repo.MarkNotFound(ctx, routerID)
}
```

### 4. Use Name for Profiles (Different from Secrets)

Profiles use their name as identifier (they're unique by design):

```bash
# This works for profiles
/ppp/profile/remove
=.id=default
```

## API Endpoints

### Standard CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/mikrotik/{routerId}/pppoe` | List all secrets |
| GET | `/v1/mikrotik/{routerId}/pppoe/{id}` | Get specific secret |
| POST | `/v1/mikrotik/{routerId}/pppoe` | Create new secret |
| PUT | `/v1/mikrotik/{routerId}/pppoe/{id}` | Update secret |
| DELETE | `/v1/mikrotik/{routerId}/pppoe/{id}` | Delete secret |

### Session Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/mikrotik/{routerId}/pppoe/sessions` | List active sessions (WebSocket) |
| POST | `/v1/mikrotik/{routerId}/pppoe/disconnect` | Disconnect session |

### Synchronization

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/mikrotik/{routerId}/pppoe/sync` | Sync database with MikroTik |

### Request/Response Examples

#### Create Secret
```http
POST /v1/mikrotik/1/pppoe
Content-Type: application/json

{
  "name": "user123",
  "password": "secretpass",
  "profile": "default",
  "service": "pppoe"
}

Response:
{
  "statusCode": 201,
  "data": {
    "id": 42,
    "mikrotik_id": "*15",
    "name": "user123",
    "profile": "default",
    "sync_status": "synced"
  }
}
```

#### Disconnect Session
```http
POST /v1/mikrotik/1/pppoe/disconnect
Content-Type: application/json

{
  "session_name": "user123"
}

Response:
{
  "statusCode": 200,
  "message": "Session disconnected successfully"
}
```

#### Sync Secrets
```http
POST /v1/mikrotik/1/pppoe/sync

Response:
{
  "statusCode": 200,
  "message": "PPPoE secrets synchronized successfully"
}
```

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `no such item` | Wrong `.id` used | Fetch correct `.id` before operation |
| `no such item` | Item already deleted | Check if exists before delete |
| `already have` | Duplicate name | Check uniqueness before create |
| `ambiguous value` | Multiple matches | Use more specific query |
| `expected end of command` | Syntax error | Check command formatting |

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid params) |
| 404 | Not Found (secret/session not found) |
| 409 | Conflict (duplicate name) |
| 500 | Internal Server Error |

## Database Schema

```sql
CREATE TABLE mikrotik_pppoe_secrets (
  id SERIAL PRIMARY KEY,
  router_id INTEGER NOT NULL,
  mikrotik_id VARCHAR(50),           -- RouterOS internal .id
  name VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL,
  profile VARCHAR(100),
  service VARCHAR(50) DEFAULT 'pppoe',
  local_address VARCHAR(50),
  remote_address VARCHAR(50),
  comment TEXT,
  disabled BOOLEAN DEFAULT FALSE,
  sync_status VARCHAR(20) DEFAULT 'pending',  -- synced, pending, error, not_found
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pppoe_router_id ON mikrotik_pppoe_secrets(router_id);
CREATE INDEX idx_pppoe_mikrotik_id ON mikrotik_pppoe_secrets(router_id, mikrotik_id);
CREATE UNIQUE INDEX idx_pppoe_router_name ON mikrotik_pppoe_secrets(router_id, name);
```

## Migration Steps

1. **Run database migration**:
   ```bash
   cd net-backend
   go run cmd/migrate/main.go up
   ```

2. **Sync existing secrets**:
   ```bash
   # For each router
   curl -X POST http://api/v1/mikrotik/{routerId}/pppoe/sync
   ```

3. **Verify sync status**:
   ```sql
   SELECT name, mikrotik_id, sync_status 
   FROM mikrotik_pppoe_secrets 
   WHERE sync_status != 'synced';
   ```
