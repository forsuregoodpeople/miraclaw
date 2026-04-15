package mikrotik

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type RouterRepository interface {
	FindAll(ctx context.Context) ([]Router, error)
	FindAllByMitraID(ctx context.Context, mitraID int) ([]Router, error)
	FindById(ctx context.Context, id int) (*Router, error)
	Create(ctx context.Context, router *Router) error
	Update(ctx context.Context, router *Router) error
	UpdateStatus(ctx context.Context, id int, status string) error
	Delete(ctx context.Context, id int) error
	ToggleActive(ctx context.Context, id int, isActive bool) error
}

type repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) RouterRepository {
	return &repository{db: db}
}

func (r *repository) FindAll(ctx context.Context) ([]Router, error) {
	query := `SELECT id, name, host, port, username, password, mitra_id, COALESCE(status, 'unknown'), COALESCE(is_active, true), latitude, longitude, created_at, updated_at FROM mikrotik_routers`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("Repository FindAll query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	var routers []Router
	for rows.Next() {
		var router Router
		if err := rows.Scan(&router.ID, &router.Name, &router.Host, &router.Port, &router.Username, &router.Password, &router.MitraID, &router.Status, &router.IsActive, &router.Latitude, &router.Longitude, &router.CreatedAt, &router.UpdatedAt); err != nil {
			log.Printf("Repository FindAll scan error: %v", err)
			return nil, err
		}
		routers = append(routers, router)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Repository FindAll rows error: %v", err)
		return nil, err
	}
	return routers, nil
}

func (r *repository) FindAllByMitraID(ctx context.Context, mitraID int) ([]Router, error) {
	query := `SELECT id, name, host, port, username, password, mitra_id, COALESCE(status, 'unknown'), COALESCE(is_active, true), latitude, longitude, created_at, updated_at FROM mikrotik_routers WHERE mitra_id = $1`
	rows, err := r.db.QueryContext(ctx, query, mitraID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routers []Router
	for rows.Next() {
		var router Router
		if err := rows.Scan(&router.ID, &router.Name, &router.Host, &router.Port, &router.Username, &router.Password, &router.MitraID, &router.Status, &router.IsActive, &router.Latitude, &router.Longitude, &router.CreatedAt, &router.UpdatedAt); err != nil {
			return nil, err
		}
		routers = append(routers, router)
	}
	return routers, nil
}

func (r *repository) FindById(ctx context.Context, id int) (*Router, error) {
	query := `SELECT id, name, host, port, username, password, mitra_id, COALESCE(status, 'unknown'), COALESCE(is_active, true), latitude, longitude, created_at, updated_at FROM mikrotik_routers WHERE id = $1`
	var router Router
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&router.ID, &router.Name, &router.Host, &router.Port, &router.Username, &router.Password, &router.MitraID, &router.Status, &router.IsActive, &router.Latitude, &router.Longitude, &router.CreatedAt, &router.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &router, nil
}

func (r *repository) Create(ctx context.Context, router *Router) error {
	query := `INSERT INTO mikrotik_routers (name, host, port, username, password, mitra_id, status, is_active, latitude, longitude, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`
	now := time.Now()
	router.CreatedAt = &now
	router.UpdatedAt = &now
	if router.Status == "" {
		router.Status = "unknown"
	}
	err := r.db.QueryRowContext(ctx, query, router.Name, router.Host, router.Port, router.Username, router.Password, router.MitraID, router.Status, router.IsActive, router.Latitude, router.Longitude, router.CreatedAt, router.UpdatedAt).Scan(&router.ID)
	return err
}

func (r *repository) Update(ctx context.Context, router *Router) error {
	query := `UPDATE mikrotik_routers SET name = $1, host = $2, port = $3, username = $4, password = $5, status = $6, is_active = $7, latitude = $8, longitude = $9, updated_at = $10 WHERE id = $11`
	now := time.Now()
	router.UpdatedAt = &now
	_, err := r.db.ExecContext(ctx, query, router.Name, router.Host, router.Port, router.Username, router.Password, router.Status, router.IsActive, router.Latitude, router.Longitude, router.UpdatedAt, router.ID)
	return err
}

func (r *repository) UpdateStatus(ctx context.Context, id int, status string) error {
	query := `UPDATE mikrotik_routers SET status = $1, updated_at = $2 WHERE id = $3`
	now := time.Now()
	_, err := r.db.ExecContext(ctx, query, status, now, id)
	return err
}

func (r *repository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM mikrotik_routers WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *repository) ToggleActive(ctx context.Context, id int, isActive bool) error {
	query := `UPDATE mikrotik_routers SET is_active = $1, updated_at = $2 WHERE id = $3`
	now := time.Now()
	_, err := r.db.ExecContext(ctx, query, isActive, now, id)
	return err
}
