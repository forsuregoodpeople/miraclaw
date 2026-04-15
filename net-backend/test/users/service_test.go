package users_test

import (
	"context"
	"errors"
	"testing"

	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type MockUserRepository struct {
	mock.Mock
}

func (m *MockUserRepository) FindAll(ctx context.Context) ([]users.Users, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]users.Users), args.Error(1)
}

func (m *MockUserRepository) FindById(ctx context.Context, id int) (*users.Users, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*users.Users), args.Error(1)
}

func (m *MockUserRepository) FindByUsernameOrEmail(ctx context.Context, username, email string) (*users.Users, error) {
	args := m.Called(ctx, username, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*users.Users), args.Error(1)
}

func (m *MockUserRepository) Create(ctx context.Context, user *users.Users) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Update(ctx context.Context, user *users.Users) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Delete(ctx context.Context, id int) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func TestService_FindAll(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	expectedUsers := []users.Users{
		{ID: 1, Username: "user1", Role: users.RoleAdmin},
		{ID: 2, Username: "user2", Role: users.RoleTeknisi},
	}

	mockRepo.On("FindAll", ctx).Return(expectedUsers, nil)

	result, err := service.FindAll(ctx)

	assert.NoError(t, err)
	assert.Equal(t, expectedUsers, result)
	mockRepo.AssertExpectations(t)
}

func TestService_FindById_Success(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	expectedUser := &users.Users{ID: 1, Username: "user1", Role: users.RoleAdmin}

	mockRepo.On("FindById", ctx, 1).Return(expectedUser, nil)

	result, err := service.FindById(ctx, 1)

	assert.NoError(t, err)
	assert.Equal(t, expectedUser, result)
	mockRepo.AssertExpectations(t)
}

func TestService_FindById_NotFound(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	mockRepo.On("FindById", ctx, 999).Return(nil, errors.New("user not found"))

	result, err := service.FindById(ctx, 999)

	assert.Error(t, err)
	assert.Nil(t, result)
	mockRepo.AssertExpectations(t)
}

func TestService_Create_SuperAdmin_Mitra(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	actingUser := users.Users{ID: 1, Role: users.RoleSuperAdmin}
	newUser := &users.Users{
		Username: "newmitra",
		Name:     "New Mitra",
		Email:    "mitra@example.com",
		Password: "password123",
		Role:     users.RoleMitra,
	}

	mockRepo.On("Create", ctx, mock.AnythingOfType("*users.Users")).Return(nil)

	result, err := service.Create(ctx, newUser, actingUser)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, "newmitra", result.Username)
	mockRepo.AssertExpectations(t)
}

func TestService_Create_Mitra_Teknisi(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	actingUser := users.Users{ID: 5, Role: users.RoleMitra}
	newUser := &users.Users{
		Username: "newteknisi",
		Name:     "New Teknisi",
		Email:    "teknisi@example.com",
		Password: "password123",
		Role:     users.RoleTeknisi,
	}

	mockRepo.On("Create", ctx, mock.AnythingOfType("*users.Users")).Return(nil)

	result, err := service.Create(ctx, newUser, actingUser)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, "newteknisi", result.Username)
	assert.NotNil(t, result.ParentID)
	assert.Equal(t, 5, *result.ParentID)
	mockRepo.AssertExpectations(t)
}

func TestService_Create_Mitra_InvalidRole(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	actingUser := users.Users{ID: 5, Role: users.RoleMitra}
	newUser := &users.Users{
		Username: "newuser",
		Name:     "New User",
		Email:    "user@example.com",
		Password: "password123",
		Role:     users.RoleSuperAdmin,
	}

	result, err := service.Create(ctx, newUser, actingUser)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "can only create Admin or Teknisi")
}

func TestService_Create_Teknisi_Unauthorized(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	actingUser := users.Users{ID: 10, Role: users.RoleTeknisi}
	newUser := &users.Users{
		Username: "newuser",
		Name:     "New User",
		Email:    "user@example.com",
		Password: "password123",
		Role:     users.RoleAdmin,
	}

	result, err := service.Create(ctx, newUser, actingUser)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "permission")
}

func TestService_Login_Success(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	input := &users.LoginInput{
		Username: "testuser",
		Password: "password123",
	}

	hashedPassword, _ := pkg.HashPassword(input.Password)
	user := &users.Users{
		ID:       1,
		Username: "testuser",
		Password: hashedPassword,
		Role:     users.RoleAdmin,
	}

	mockRepo.On("FindByUsernameOrEmail", ctx, "testuser", "testuser").Return(user, nil)

	resultUser, token, err := service.Login(ctx, input)

	assert.NoError(t, err)
	assert.NotNil(t, resultUser)
	assert.NotNil(t, token)
	assert.Equal(t, "testuser", resultUser.Username)
	assert.Empty(t, resultUser.Password)
	mockRepo.AssertExpectations(t)
}

func TestService_Login_InvalidCredentials(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	input := &users.LoginInput{
		Username: "testuser",
		Password: "wrongpassword",
	}

	hashedPassword, _ := pkg.HashPassword("password123")
	user := &users.Users{
		ID:       1,
		Username: "testuser",
		Password: hashedPassword,
		Role:     users.RoleAdmin,
	}

	mockRepo.On("FindByUsernameOrEmail", ctx, "testuser", "testuser").Return(user, nil)

	resultUser, token, err := service.Login(ctx, input)

	assert.Error(t, err)
	assert.Nil(t, resultUser)
	assert.Nil(t, token)
	assert.Contains(t, err.Error(), "Invalid")
	mockRepo.AssertExpectations(t)
}

func TestService_Login_UserNotFound(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	input := &users.LoginInput{
		Username: "nonexistent",
		Password: "password123",
	}

	mockRepo.On("FindByUsernameOrEmail", ctx, "nonexistent", "nonexistent").Return(nil, errors.New("not found"))

	resultUser, token, err := service.Login(ctx, input)

	assert.Error(t, err)
	assert.Nil(t, resultUser)
	assert.Nil(t, token)
	assert.Contains(t, err.Error(), "Invalid")
	mockRepo.AssertExpectations(t)
}

func TestService_Update(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	user := &users.Users{
		ID:    1,
		Name:  "Updated Name",
		Email: "updated@example.com",
		Role:  users.RoleAdmin,
	}

	mockRepo.On("Update", ctx, user).Return(nil)

	err := service.Update(ctx, user)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
}

func TestService_Delete(t *testing.T) {
	mockRepo := new(MockUserRepository)
	service := users.NewUserService(mockRepo)

	ctx := context.Background()
	mockRepo.On("Delete", ctx, 1).Return(nil)

	err := service.Delete(ctx, 1)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
}
