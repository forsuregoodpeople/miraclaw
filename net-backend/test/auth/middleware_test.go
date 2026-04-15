package auth_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/users"
	pkgauth "github.com/net-backend/pkg"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuth_GenerateToken(t *testing.T) {
	userID := 1
	userRole := users.RoleAdmin

	token, err := pkgauth.GenerateToken(userID, userRole)

	assert.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.Contains(t, token, "eyJ") // JWT starts with "eyJ" (base64)
}

func TestAuth_HashPassword(t *testing.T) {
	password := "password123"

	hash, err := pkgauth.HashPassword(password)

	assert.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, password, hash) // Hash should not equal plain password
	assert.Contains(t, hash, "$2a$")   // bcrypt hash starts with "$2a$"
}

func TestAuth_VerifyPassword_Success(t *testing.T) {
	password := "password123"
	hash, _ := pkgauth.HashPassword(password)

	err := pkgauth.VerifyPassword(hash, password)

	assert.NoError(t, err)
}

func TestAuth_VerifyPassword_Fail(t *testing.T) {
	password := "password123"
	wrongPassword := "wrongpassword"
	hash, _ := pkgauth.HashPassword(password)

	err := pkgauth.VerifyPassword(hash, wrongPassword)

	assert.Error(t, err)
}

func TestAuth_HashVerify_DifferentHashes(t *testing.T) {
	password := "password123"

	hash1, err := pkgauth.HashPassword(password)
	require.NoError(t, err)

	hash2, err := pkgauth.HashPassword(password)
	require.NoError(t, err)

	// Same password should produce different hashes (bcrypt salt)
	assert.NotEqual(t, hash1, hash2)

	// Both hashes should verify successfully
	err1 := pkgauth.VerifyPassword(hash1, password)
	err2 := pkgauth.VerifyPassword(hash2, password)

	assert.NoError(t, err1)
	assert.NoError(t, err2)
}

func TestAuth_HashPassword_Empty(t *testing.T) {
	password := ""

	hash, err := pkgauth.HashPassword(password)

	assert.NoError(t, err)
	assert.NotEmpty(t, hash)

	err = pkgauth.VerifyPassword(hash, password)
	assert.NoError(t, err)
}

func TestAuth_VerifyPassword_EmptyHash(t *testing.T) {
	password := "password123"

	err := pkgauth.VerifyPassword("", password)

	assert.Error(t, err)
}

func TestAuth_VerifyPassword_EmptyPassword(t *testing.T) {
	hash, _ := pkgauth.HashPassword("password123")

	err := pkgauth.VerifyPassword(hash, "")

	assert.Error(t, err)
}

func TestAuth_Role(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", pkgauth.Auth(), pkgauth.Role(users.RoleAdmin), func(c *fiber.Ctx) error {
		return c.SendString("Admin endpoint")
	})

	req1 := createAuthenticatedRequest(app, "GET", "/admin", users.RoleAdmin)
	resp1, err := req1()
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp1.StatusCode)

	req2 := createAuthenticatedRequest(app, "GET", "/admin", users.RoleMitra)
	resp2, err := req2()
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusForbidden, resp2.StatusCode)
}

func TestAuth_Role_MultipleRoles(t *testing.T) {
	app := fiber.New()
	app.Get("/protected", pkgauth.Auth(), pkgauth.Role(users.RoleAdmin, users.RoleSuperAdmin), func(c *fiber.Ctx) error {
		return c.SendString("Protected endpoint")
	})

	req1 := createAuthenticatedRequest(app, "GET", "/protected", users.RoleAdmin)
	resp1, err := req1()
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp1.StatusCode)

	req2 := createAuthenticatedRequest(app, "GET", "/protected", users.RoleSuperAdmin)
	resp2, err := req2()
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp2.StatusCode)

	req3 := createAuthenticatedRequest(app, "GET", "/protected", users.RoleMitra)
	resp3, err := req3()
	assert.NoError(t, err)
	assert.Equal(t, fiber.StatusForbidden, resp3.StatusCode)
}

func TestAuth_UserID(t *testing.T) {
	app := fiber.New()
	app.Get("/user-id", pkgauth.Auth(), func(c *fiber.Ctx) error {
		userID := pkgauth.UserID(c)
		return c.JSON(fiber.Map{"user_id": userID})
	})

	req := createAuthenticatedRequest(app, "GET", "/user-id", users.RoleAdmin)
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestAuth_UserRole(t *testing.T) {
	app := fiber.New()
	app.Get("/user-role", pkgauth.Auth(), func(c *fiber.Ctx) error {
		role := pkgauth.UserRole(c)
		return c.JSON(fiber.Map{"role": role})
	})

	req := createAuthenticatedRequest(app, "GET", "/user-role", users.RoleAdmin)
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestAuth_IsAuthenticated(t *testing.T) {
	app := fiber.New()
	app.Get("/check", pkgauth.Auth(), func(c *fiber.Ctx) error {
		isAuth := pkgauth.IsAuthenticated(c)
		return c.JSON(fiber.Map{"authenticated": isAuth})
	})

	req := createAuthenticatedRequest(app, "GET", "/check", users.RoleAdmin)
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestAuth_HasRole(t *testing.T) {
	app := fiber.New()
	app.Get("/check-role", pkgauth.Auth(), func(c *fiber.Ctx) error {
		hasRole := pkgauth.HasRole(c, users.RoleAdmin)
		return c.JSON(fiber.Map{"has_role": hasRole})
	})

	req := createAuthenticatedRequest(app, "GET", "/check-role", users.RoleAdmin)
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestAuth_HasAnyRole(t *testing.T) {
	app := fiber.New()
	app.Get("/check-any-role", pkgauth.Auth(), func(c *fiber.Ctx) error {
		hasAnyRole := pkgauth.HasAnyRole(c, users.RoleAdmin, users.RoleSuperAdmin)
		return c.JSON(fiber.Map{"has_any_role": hasAnyRole})
	})

	req := createAuthenticatedRequest(app, "GET", "/check-any-role", users.RoleAdmin)
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func TestAuth_NoToken(t *testing.T) {
	app := fiber.New()
	app.Use(pkgauth.Auth())
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.SendString("Protected")
	})

	req := createRequest(app, "GET", "/protected")
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestAuth_InvalidTokenFormat(t *testing.T) {
	app := fiber.New()
	app.Use(pkgauth.Auth())
	app.Get("/protected", func(c *fiber.Ctx) error {
		return c.SendString("Protected")
	})

	req := createRequestWithHeader(app, "GET", "/protected", "Authorization", "InvalidToken")
	resp, err := req()
	require.NoError(t, err)

	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
}

func TestAuth_AllRoles(t *testing.T) {
	roles := []string{
		users.RoleSuperAdmin,
		users.RoleMitra,
		users.RoleAdmin,
		users.RoleTeknisi,
	}

	for _, role := range roles {
		t.Run("Role_"+role, func(t *testing.T) {
			userID := 1
			userRole := role

			token, err := pkgauth.GenerateToken(userID, userRole)
			assert.NoError(t, err)
			assert.NotEmpty(t, token)
		})
	}
}

func createAuthenticatedRequest(app *fiber.App, method, path, role string) func() (*http.Response, error) {
	return func() (*http.Response, error) {
		userID := 1
		userRole := role
		token, _ := pkgauth.GenerateToken(userID, userRole)

		req := httptest.NewRequest(method, path, strings.NewReader(""))
		req.Header.Set("Authorization", "Bearer "+token)
		return app.Test(req)
	}
}

func createRequest(app *fiber.App, method, path string) func() (*http.Response, error) {
	return func() (*http.Response, error) {
		req := httptest.NewRequest(method, path, strings.NewReader(""))
		return app.Test(req)
	}
}

func createRequestWithHeader(app *fiber.App, method, path, key, value string) func() (*http.Response, error) {
	return func() (*http.Response, error) {
		req := httptest.NewRequest(method, path, strings.NewReader(""))
		req.Header.Set(key, value)
		return app.Test(req)
	}
}
