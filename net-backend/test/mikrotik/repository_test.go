package mikrotik_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/net-backend/internal/mikrotik"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRepository_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	_ = time.Now()

	router := &mikrotik.Router{
		Name:     "Test Router",
		Host:     "10.10.10.1",
		Port:     8728,
		Username: "admin",
		Password: "123",
		MitraID:  1,
	}

	mock.ExpectQuery(`INSERT INTO mikrotik_routers`).
		WithArgs(router.Name, router.Host, router.Port, router.Username, router.Password, router.MitraID, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	err = repo.Create(ctx, router)
	require.NoError(t, err)
	assert.Equal(t, 1, router.ID, "Router ID should be set after insert")
	assert.NotNil(t, router.CreatedAt, "CreatedAt should be set")
	assert.NotNil(t, router.UpdatedAt, "UpdatedAt should be set")
}

func TestRepository_FindById(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	now := time.Now()

	tests := []struct {
		name    string
		id      int
		want    *mikrotik.Router
		wantErr bool
		mockFn  func()
	}{
		{
			name: "Found router",
			id:   1,
			want: &mikrotik.Router{
				ID:        1,
				Name:      "Test Router",
				Host:      "10.10.10.1",
				Port:      8728,
				Username:  "admin",
				Password:  "123",
				MitraID:   1,
				CreatedAt: &now,
				UpdatedAt: &now,
			},
			wantErr: false,
			mockFn: func() {
				mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers WHERE id = \$1`).
					WithArgs(1).
					WillReturnRows(sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
						AddRow(1, "Test Router", "10.10.10.1", 8728, "admin", "123", 1, now, now))
			},
		},
		{
			name:    "Router not found",
			id:      999,
			want:    nil,
			wantErr: true,
			mockFn: func() {
				mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers WHERE id = \$1`).
					WithArgs(999).
					WillReturnError(sql.ErrNoRows)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockFn()

			got, err := repo.FindById(ctx, tt.id)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, got)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.want.ID, got.ID)
				assert.Equal(t, tt.want.Name, got.Name)
				assert.Equal(t, tt.want.Host, got.Host)
				assert.Equal(t, tt.want.Port, got.Port)
				assert.Equal(t, tt.want.Username, got.Username)
				assert.Equal(t, tt.want.Password, got.Password)
				assert.Equal(t, tt.want.MitraID, got.MitraID)
			}

			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestRepository_FindAll(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	now := time.Now()

	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now).
		AddRow(2, "Router 2", "10.10.10.2", 8728, "admin", "password", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers`).
		WillReturnRows(rows)

	routers, err := repo.FindAll(ctx)
	require.NoError(t, err)
	assert.Len(t, routers, 2)
	assert.Equal(t, "Router 1", routers[0].Name)
	assert.Equal(t, "10.10.10.1", routers[0].Host)
	assert.Equal(t, "Router 2", routers[1].Name)
	assert.Equal(t, "10.10.10.2", routers[1].Host)

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_FindAllByMitraID(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	mitraID := 1
	now := time.Now()

	rows := sqlmock.NewRows([]string{"id", "name", "host", "port", "username", "password", "mitra_id", "created_at", "updated_at"}).
		AddRow(1, "Router 1", "10.10.10.1", 8728, "admin", "123", 1, now, now).
		AddRow(2, "Router 3", "10.10.10.3", 8728, "admin", "pass", 1, now, now)

	mock.ExpectQuery(`SELECT id, name, host, port, username, password, mitra_id, created_at, updated_at FROM mikrotik_routers WHERE mitra_id = \$1`).
		WithArgs(mitraID).
		WillReturnRows(rows)

	routers, err := repo.FindAllByMitraID(ctx, mitraID)
	require.NoError(t, err)
	assert.Len(t, routers, 2)

	for _, router := range routers {
		assert.Equal(t, mitraID, router.MitraID)
	}

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_Update(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	now := time.Now()
	router := &mikrotik.Router{
		ID:        1,
		Name:      "Updated Router",
		Host:      "10.10.10.100",
		Port:      8291,
		Username:  "admin",
		Password:  "newpassword",
		MitraID:   1,
		CreatedAt: &now,
		UpdatedAt: &now,
	}

	mock.ExpectExec(`UPDATE mikrotik_routers`).
		WithArgs(router.Name, router.Host, router.Port, router.Username, router.Password, sqlmock.AnyArg(), router.ID).
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = repo.Update(ctx, router)
	require.NoError(t, err)
	assert.NotNil(t, router.UpdatedAt, "UpdatedAt should be updated")

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRepository_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock database: %v", err)
	}
	defer db.Close()

	repo := mikrotik.NewRepository(db)
	ctx := context.Background()

	routerID := 1

	mock.ExpectExec(`DELETE FROM mikrotik_routers WHERE id = \$1`).
		WithArgs(routerID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	err = repo.Delete(ctx, routerID)
	require.NoError(t, err)

	assert.NoError(t, mock.ExpectationsWereMet())
}
