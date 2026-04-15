package users_test

import (
	"testing"

	"github.com/net-backend/internal/users"
	"github.com/stretchr/testify/assert"
)

func TestUsers_Validate_Success(t *testing.T) {
	user := users.Users{
		Username: "testuser",
		Name:     "Test User",
		Email:    "test@example.com",
		Password: "password123",
		Role:     users.RoleAdmin,
	}

	errors := user.Validate()
	assert.Empty(t, errors, "Should not have validation errors")
}

func TestUsers_Validate_RequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		user    users.Users
		wantErr bool
	}{
		{
			name: "Missing username",
			user: users.Users{
				Name:     "Test",
				Email:    "test@example.com",
				Password: "password123",
			},
			wantErr: true,
		},
		{
			name: "Missing name",
			user: users.Users{
				Username: "testuser",
				Email:    "test@example.com",
				Password: "password123",
			},
			wantErr: true,
		},
		{
			name: "Missing email",
			user: users.Users{
				Username: "testuser",
				Name:     "Test",
				Password: "password123",
			},
			wantErr: true,
		},
		{
			name: "Missing password",
			user: users.Users{
				Username: "testuser",
				Name:     "Test",
				Email:    "test@example.com",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errors := tt.user.Validate()
			if tt.wantErr {
				assert.NotEmpty(t, errors, "Should have validation errors")
			} else {
				assert.Empty(t, errors, "Should not have validation errors")
			}
		})
	}
}

func TestUsers_Validate_InvalidEmail(t *testing.T) {
	user := users.Users{
		Username: "testuser",
		Name:     "Test User",
		Email:    "invalid-email",
		Password: "password123",
	}

	errors := user.Validate()
	assert.NotEmpty(t, errors, "Should have validation error for invalid email")

	var hasEmailError bool
	for _, e := range errors {
		if e.Field == "email" {
			hasEmailError = true
			break
		}
	}
	assert.True(t, hasEmailError, "Should have email field error")
}

func TestUsers_Validate_PasswordTooShort(t *testing.T) {
	user := users.Users{
		Username: "testuser",
		Name:     "Test User",
		Email:    "test@example.com",
		Password: "short",
	}

	errors := user.Validate()
	assert.NotEmpty(t, errors, "Should have validation error for short password")

	var hasPasswordError bool
	for _, e := range errors {
		if e.Field == "password" {
			hasPasswordError = true
			break
		}
	}
	assert.True(t, hasPasswordError, "Should have password field error")
}

func TestUsers_Validate_InvalidRole(t *testing.T) {
	user := users.Users{
		Username: "testuser",
		Name:     "Test User",
		Email:    "test@example.com",
		Password: "password123",
		Role:     "invalid_role",
	}

	errors := user.Validate()
	assert.NotEmpty(t, errors, "Should have validation error for invalid role")
}

func TestUsers_Validate_ValidRoles(t *testing.T) {
	validRoles := []string{
		users.RoleSuperAdmin,
		users.RoleMitra,
		users.RoleTeknisi,
		users.RoleAdmin,
	}

	for _, role := range validRoles {
		t.Run("Role_"+role, func(t *testing.T) {
			user := users.Users{
				Username: "testuser",
				Name:     "Test User",
				Email:    "test@example.com",
				Password: "password123",
				Role:     role,
			}

			errors := user.Validate()
			assert.Empty(t, errors, "Should not have validation errors for role "+role)
		})
	}
}
