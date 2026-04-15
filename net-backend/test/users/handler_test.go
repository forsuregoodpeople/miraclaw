package users_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/session"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
	pkgauth "github.com/net-backend/pkg"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

type MockUserService struct {
	mock.Mock
}

type MockSession struct {
	mock.Mock
}

func (m *MockSession) Create(ctx context.Context, data session.SessionData) (string, error) {
	args := m.Called(ctx, data)
	if args.Get(0) == nil {
		return "", args.Error(1)
	}
	return args.String(0), args.Error(1)
}

func (m *MockSession) Delete(ctx context.Context, sessionID string) error {
	args := m.Called(ctx, sessionID)
	return args.Error(0)
}

func (m *MockSession) GetCookieName() string {
	return "session_id"
}

func (m *MockUserService) FindAll(ctx context.Context) ([]users.Users, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]users.Users), args.Error(1)
}

func (m *MockUserService) FindById(ctx context.Context, id int) (*users.Users, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*users.Users), args.Error(1)
}

func (m *MockUserService) Login(ctx context.Context, input *users.LoginInput) (*users.Users, *string, error) {
	args := m.Called(ctx, input)
	if args.Get(0) == nil {
		return nil, nil, args.Error(2)
	}
	return args.Get(0).(*users.Users), args.Get(1).(*string), args.Error(2)
}

func (m *MockUserService) Create(ctx context.Context, userReq *users.Users, actingUser users.Users) (*users.Users, error) {
	args := m.Called(ctx, userReq, actingUser)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*users.Users), args.Error(1)
}

func (m *MockUserService) Update(ctx context.Context, userReq *users.Users) error {
	args := m.Called(ctx, userReq)
	return args.Error(0)
}

func (m *MockUserService) Delete(ctx context.Context, id int) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func TestHandler_CreateUser_Success(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Post("/users", pkgauth.Auth(), handler.CreateUser)

	newUser := map[string]interface{}{
		"username": "newuser",
		"name":     "New User",
		"email":    "new@example.com",
		"password": "password123",
		"role":     users.RoleAdmin,
	}

	body, _ := json.Marshal(newUser)
	req := httptest.NewRequest("POST", "/users", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+generateTestToken(1, users.RoleSuperAdmin))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusCreated, resp.StatusCode)

	mockService.AssertNotCalled(t, "Create")
}

func TestHandler_CreateUser_ValidationFailed(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Post("/users", pkgauth.Auth(), handler.CreateUser)

	invalidUser := map[string]interface{}{
		"username": "",
		"name":     "Test",
		"email":    "invalid",
		"password": "short",
	}

	body, _ := json.Marshal(invalidUser)
	req := httptest.NewRequest("POST", "/users", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+generateTestToken(1, users.RoleSuperAdmin))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusConflict, resp.StatusCode)
	mockService.AssertNotCalled(t, "Create")
}

func TestHandler_Login_Success(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Post("/login", handler.Login)

	loginInput := map[string]interface{}{
		"username": "testuser",
		"password": "password123",
	}

	token := "test-token-123"
	user := &users.Users{ID: 1, Username: "testuser", Role: users.RoleAdmin}
	mockSession.On("Create", mock.Anything, mock.Anything).Return("test-session-id", nil)

	mockService.On("Login", mock.Anything, mock.MatchedBy(func(input *users.LoginInput) bool {
		return input.Username == "testuser" && input.Password == "password123"
	})).Return(user, &token, nil)

	body, _ := json.Marshal(loginInput)
	req := httptest.NewRequest("POST", "/login", bytes.NewReader(body))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response pkg.Response
	responseBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(responseBody, &response)

	assert.NotNil(t, response.Data)
	mockService.AssertExpectations(t)
}

func TestHandler_Login_InvalidCredentials(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Post("/login", handler.Login)

	loginInput := map[string]interface{}{
		"username": "testuser",
		"password": "wrongpassword",
	}

	mockService.On("Login", mock.Anything, mock.Anything).Return(nil, nil, errors.New("Invalid credentials"))

	body, _ := json.Marshal(loginInput)
	req := httptest.NewRequest("POST", "/login", bytes.NewReader(body))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	mockService.AssertExpectations(t)
}

func TestHandler_FindAll_Success(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Get("/users", pkgauth.Auth(), handler.FindAll)

	expectedUsers := []users.Users{
		{ID: 1, Username: "user1", Role: users.RoleAdmin},
		{ID: 2, Username: "user2", Role: users.RoleTeknisi},
	}

	mockService.On("FindAll", mock.Anything).Return(expectedUsers, nil)

	req := httptest.NewRequest("GET", "/users", nil)
	req.Header.Set("Authorization", "Bearer "+generateTestToken(1, users.RoleSuperAdmin))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response pkg.Response
	responseBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(responseBody, &response)

	data, ok := response.Data.([]interface{})
	assert.True(t, ok)
	assert.Len(t, data, 2)
	mockService.AssertExpectations(t)
}

func TestHandler_FindById_Success(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Get("/users/:id", pkgauth.Auth(), handler.FindById)

	expectedUser := &users.Users{ID: 1, Username: "testuser", Role: users.RoleAdmin}

	mockService.On("FindById", mock.Anything, 1).Return(expectedUser, nil)

	req := httptest.NewRequest("GET", "/users/1", nil)
	req.Header.Set("Authorization", "Bearer "+generateTestToken(1, users.RoleSuperAdmin))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var response pkg.Response
	responseBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(responseBody, &response)

	assert.NotNil(t, response.Data)
	mockService.AssertExpectations(t)
}

func TestHandler_FindById_NotFound(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Get("/users/:id", pkgauth.Auth(), handler.FindById)

	mockService.On("FindById", mock.Anything, 999).Return(nil, errors.New("user not found"))

	req := httptest.NewRequest("GET", "/users/999", nil)
	req.Header.Set("Authorization", "Bearer "+generateTestToken(1, users.RoleSuperAdmin))
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	mockService.AssertExpectations(t)
}

func TestHandler_Unauthorized(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Get("/users", handler.FindAll)

	req := httptest.NewRequest("GET", "/users", nil)
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	mockService.AssertNotCalled(t, "FindAll")
}

func TestHandler_InvalidTokenFormat(t *testing.T) {
	mockService := new(MockUserService)
	mockSession := new(MockSession)
	handler := users.NewUserHandler(mockService, mockSession)

	app := fiber.New()
	app.Get("/users", pkgauth.Auth(), handler.FindAll)

	req := httptest.NewRequest("GET", "/users", nil)
	req.Header.Set("Authorization", "InvalidToken")
	resp, err := app.Test(req)

	require.NoError(t, err)
	assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
	mockService.AssertNotCalled(t, "FindAll")
}

func generateTestToken(userID int, role string) string {
	token, _ := pkgauth.GenerateToken(userID, role)
	return token
}
