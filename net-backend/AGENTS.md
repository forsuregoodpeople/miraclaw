# AGENTS.md

Guidelines for agentic coding agents working on net-backend codebase.

---

## Build & Test Commands

```bash
# Build
go build ./... && go build ./cmd/wifimaster/main.go

# Tests
go test ./...                           # All tests
go test -v -run TestName ./path          # Single test (exact function name)
go test -cover ./...                     # With coverage
go test -race ./...                      # Race detection

# Database
go run cmd/migrate/main.go               # Run migrations
go run cmd/seeder/main.go                # Seed database

# Maintenance
go fmt ./... && go mod tidy
```

---

## Code Style Guidelines

### Imports

Order: Std lib → Third-party → Internal (github.com/net-backend)

### Naming

- Packages: lowercase single words (`users`, `mikrotik`)
- Interfaces: `I` prefix (`IUserService`, `IUserRepository`)
- Constants: PascalCase or UPPER_SNAKE_CASE
- Private: camelCase, Public: PascalCase

### Struct Tags

```go
type Users struct {
    ID        int        `json:"id"`
    Username  string     `form:"username" json:"username" validate:"required, min=3"`
    Email     string     `form:"email" json:"email" validate:"required,email"`
    Role      string     `form:"role" json:"role" validate:"omitempty, oneof=superadmin mitra"`
    ParentID  *int       `json:"parent_id"`
    CreatedAt *time.Time `json:"created_at"`
}
```

- JSON/Form: snake_case
- Validate: `required`, `min=3`, `max=100`, `email`, `oneof=a b c`, `omitempty`

### Function Signatures

**Context is always first parameter:**
```go
func (s *UserService) FindById(ctx context.Context, id int) (*Users, error)
func (r *repository) Create(ctx context.Context, user *Users) error
```

### Error Handling

```go
import "github.com/net-backend/pkg"

// Service layer
return nil, pkg.NewError("Invalid credentials")
return nil, pkg.WrapError("Failed to create user", err)

// Repository layer
return nil, err
```

### Database Patterns

**Always use QueryContext with ctx, parameterized queries ($1, $2), defer rows.Close():**
```go
query := `SELECT id, name FROM users WHERE id = $1`
rows, err := r.db.QueryContext(ctx, query, id)
if err != nil { return nil, err }
defer rows.Close()

// Single row
var user Users
err := r.db.QueryRowContext(ctx, query, id).Scan(&user.ID, &user.Name)

// Insert with RETURNING id
query := `INSERT INTO users (name) VALUES ($1) RETURNING id`
err := r.db.QueryRowContext(ctx, query, user.Name).Scan(&user.ID)
```

### Handler Patterns (Fiber)

```go
func (h *Handler) CreateUser(c *fiber.Ctx) error {
    var input CreateUserInput
    if err := c.BodyParser(&input); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
            StatusCode: fiber.StatusBadRequest, Message: "Invalid request body",
        })
    }

    result, err := h.service.Create(c.Context(), &input)
    if err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
            StatusCode: fiber.StatusInternalServerError, Message: err.Error(),
        })
    }

    return c.Status(fiber.StatusCreated).JSON(pkg.Response{
        StatusCode: fiber.StatusCreated, Data: result,
    })
}
```

**Status Codes:** 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 409 Conflict, 500 Internal Server Error

### Service Layer

```go
func (s *UserService) Create(ctx context.Context, userReq *Users, actingUser Users) (*Users, error) {
    // RBAC check
    if actingUser.Role == RoleSuperAdmin {
        if userReq.Role != RoleMitra { return nil, pkg.NewError("Invalid role") }
    } else if actingUser.Role == RoleMitra {
        if userReq.Role != RoleAdmin && userReq.Role != RoleTeknisi {
            return nil, pkg.NewError("Mitra can only create Admin or Teknisi")
        }
        userReq.ParentID = &actingUser.ID
    } else {
        return nil, pkg.NewError("No permission")
    }

    // Hash password
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), bcrypt.DefaultCost)
    if err != nil { return nil, err }
    userReq.Password = string(hashedPassword)

    err = s.repo.Create(ctx, userReq)
    return userReq, err
}
```

### Validation

```go
func (u *Users) Validate() []pkg.ValidationError {
    validate := validator.New()
    return pkg.ParseValidate(validate.Struct(u))
}

// In handler
if validationErrors := user.Validate(); len(validationErrors) > 0 {
    return pkg.NewErrorValidation(c, validationErrors)
}
```

### Middleware & RBAC

```go
func RBAC(roles ...string) fiber.Handler {
    return func(c *fiber.Ctx) error {
        userClaims := c.Locals("user").(jwt.MapClaims)
        userRole := userClaims["role"].(string)
        for _, role := range roles {
            if role == userRole { return c.Next() }
        }
        return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
            StatusCode: fiber.StatusForbidden, Message: "No permission",
        })
    }
}
```

### Password & JWT

```go
// Hash password
hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

// Generate JWT
claims := jwt.MapClaims{"id": user.ID, "role": user.Role, "exp": time.Now().Add(time.Hour * 72).Unix()}
token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
return token.SignedString([]byte("secret")) // TODO: Move to config
```

### Configuration

**config.yaml:**
```yaml
server:
  host: localhost
  port: 3000
database:
  host: localhost
  port: 5432
  name: net-backend
  user: postgres
  password:
redis:
  host: localhost
  port: 6379
  password: ""
  db: 0
```

Use Viper with `mapstructure:"field"` tags in config structs.

---

## Project Architecture

```
net-backend/
├── cmd/                    # Entry points (wifimaster, migrate, seeder)
├── internal/
│   ├── users/              # User domain (handler, service, repo, entity)
│   ├── mikrotik/           # Router domain
│   ├── webhook/            # Webhook handlers
│   ├── config/             # Config loading
│   ├── infrastructure/     # Redis, DB clients
│   └── server/             # Server initialization
├── pkg/                    # Shared utilities (error, response, validation)
├── migrations/             # SQL migrations
└── config.yaml             # Application config
```

**Layers:** Handler (HTTP) → Service (logic, RBAC) → Repository (DB) → Entity (models)

---

## Important Notes

1. **Security:** JWT secret hardcoded - move to config
2. **Testing:** No tests yet (testify, quicktest available)
3. **Validation:** Custom messages empty in ParseValidate
4. **Database:** Always use parameterized queries ($1, $2)
5. **Context:** Pass through all layers
6. **Timestamps:** Use `*time.Time` for nullable fields
7. **Error messages:** Descriptive, no internal exposure
