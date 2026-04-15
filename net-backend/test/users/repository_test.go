package users_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/net-backend/internal/users"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRepository_FindAll(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	rows := sqlmock.NewRows([]string{"id", "username", "name", "email", "role", "parent_id", "created_at", "updated_at"}).
		AddRow(1, "user1", "User 1", "user1@example.com", users.RoleAdmin, nil, time.Now(), time.Now()).
		AddRow(2, "user2", "User 2", "user2@example.com", users.RoleTeknisi, nil, time.Now(), time.Now())

	mock.ExpectQuery("SELECT id, username, name, email, role, parent_id, created_at, updated_at FROM users").
		WillReturnRows(rows)

	ctx := context.Background()
	result, err := repo.FindAll(ctx)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, "user1", result[0].Username)
	assert.Equal(t, "user2", result[1].Username)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_FindById_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	createdAt := time.Now()
	updatedAt := time.Now()

	row := sqlmock.NewRows([]string{"id", "username", "name", "email", "password", "role", "parent_id", "created_at", "updated_at"}).
		AddRow(1, "testuser", "Test User", "test@example.com", "hashedpassword", users.RoleAdmin, nil, createdAt, updatedAt)

	mock.ExpectQuery("SELECT id, username, name, email, password, role, parent_id, created_at, updated_at FROM users WHERE id = \\$1").
		WithArgs(1).
		WillReturnRows(row)

	ctx := context.Background()
	result, err := repo.FindById(ctx, 1)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "testuser", result.Username)
	assert.Equal(t, users.RoleAdmin, result.Role)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_FindById_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	mock.ExpectQuery("SELECT id, username, name, email, password, role, parent_id, created_at, updated_at FROM users WHERE id = \\$1").
		WithArgs(999).
		WillReturnError(sql.ErrNoRows)

	ctx := context.Background()
	result, err := repo.FindById(ctx, 999)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_FindByUsernameOrEmail_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	createdAt := time.Now()
	updatedAt := time.Now()

	row := sqlmock.NewRows([]string{"id", "username", "name", "email", "password", "role", "parent_id", "created_at", "updated_at"}).
		AddRow(1, "testuser", "Test User", "test@example.com", "hashedpassword", users.RoleAdmin, nil, createdAt, updatedAt)

	mock.ExpectQuery("SELECT id, username, name, email, password, role, parent_id, created_at, updated_at FROM users WHERE username = \\$1 OR email = \\$2").
		WithArgs("testuser", "test@example.com").
		WillReturnRows(row)

	ctx := context.Background()
	result, err := repo.FindByUsernameOrEmail(ctx, "testuser", "test@example.com")

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, "testuser", result.Username)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	user := &users.Users{
		Username: "newuser",
		Name:     "New User",
		Email:    "new@example.com",
		Password: "hashedpassword",
		Role:     users.RoleAdmin,
	}

	mock.ExpectQuery("INSERT INTO users").
		WithArgs(user.Username, user.Name, user.Email, user.Password, user.Role, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	ctx := context.Background()
	err = repo.Create(ctx, user)

	assert.NoError(t, err)
	assert.Equal(t, 1, user.ID)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_Update(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	user := &users.Users{
		ID:    1,
		Name:  "Updated Name",
		Email: "updated@example.com",
		Role:  users.RoleAdmin,
	}

	mock.ExpectExec("UPDATE users").
		WithArgs(user.Name, user.Email, user.Role, sqlmock.AnyArg(), user.ID).
		WillReturnResult(sqlmock.NewResult(1, 1))

	ctx := context.Background()
	err = repo.Update(ctx, user)

	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	repo := users.NewUserRepository(db)

	mock.ExpectExec("DELETE FROM users WHERE id = \\$1").
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(1, 1))

	ctx := context.Background()
	err = repo.Delete(ctx, 1)

	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
