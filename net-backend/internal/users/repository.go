package users

import (
	"context"
	"database/sql"
	"time"
)

type IUserRepository interface {
	FindAll(ctx context.Context) ([]Users, error)
	FindByParentID(ctx context.Context, parentID int) ([]Users, error)
	FindById(ctx context.Context, id int) (*Users, error)
	FindByUsernameOrEmail(ctx context.Context, username, email string) (*Users, error)
	Create(ctx context.Context, user *Users) error
	Update(ctx context.Context, user *Users) error
	Delete(ctx context.Context, id int) error
}

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) FindAll(ctx context.Context) ([]Users, error) {
	query := `SELECT id, username, name, email, role, parent_id, created_at, updated_at FROM users`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []Users
	for rows.Next() {
		var user Users
		var parentID sql.NullInt64
		if err := rows.Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.Role, &parentID, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, err
		}
		if parentID.Valid {
			intVal := int(parentID.Int64)
			user.ParentID = &intVal
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *UserRepository) FindByParentID(ctx context.Context, parentID int) ([]Users, error) {
	query := `SELECT id, username, name, email, role, parent_id, created_at, updated_at FROM users WHERE parent_id = $1`
	rows, err := r.db.QueryContext(ctx, query, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []Users
	for rows.Next() {
		var user Users
		var pid sql.NullInt64
		if err := rows.Scan(&user.ID, &user.Username, &user.Name, &user.Email, &user.Role, &pid, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, err
		}
		if pid.Valid {
			intVal := int(pid.Int64)
			user.ParentID = &intVal
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *UserRepository) FindById(ctx context.Context, id int) (*Users, error) {
	query := `SELECT id, username, name, email, password, role, parent_id, created_at, updated_at FROM users WHERE id = $1`
	var user Users
	var parentID sql.NullInt64
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID, &user.Username, &user.Name, &user.Email, &user.Password, &user.Role, &parentID, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if parentID.Valid {
		intVal := int(parentID.Int64)
		user.ParentID = &intVal
	} else {
		user.ParentID = nil
	}
	return &user, nil
}

func (r *UserRepository) FindByUsernameOrEmail(ctx context.Context, username, email string) (*Users, error) {
	query := `SELECT id, username, name, email, password, role, parent_id, created_at, updated_at 
              FROM users 
              WHERE username = $1 OR email = $2`

	var user Users
	var parentID sql.NullInt64

	err := r.db.QueryRowContext(ctx, query, username, email).Scan(
		&user.ID,
		&user.Username,
		&user.Name,
		&user.Email,
		&user.Password,
		&user.Role,
		&parentID,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if parentID.Valid {
		intVal := int(parentID.Int64)
		user.ParentID = &intVal
	} else {
		user.ParentID = nil
	}

	return &user, nil
}

func (r *UserRepository) Create(ctx context.Context, user *Users) error {
	query := `INSERT INTO users (username, name, email, password, role, parent_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
	now := time.Now()
	user.CreatedAt = &now
	user.UpdatedAt = &now
	err := r.db.QueryRowContext(ctx, query, user.Username, user.Name, user.Email, user.Password, user.Role, user.ParentID, user.CreatedAt, user.UpdatedAt).Scan(&user.ID)
	return err
}

func (r *UserRepository) Update(ctx context.Context, user *Users) error {
	query := `UPDATE users SET name = $1, email = $2, role = $3, updated_at = $4 WHERE id = $5`
	now := time.Now()
	user.UpdatedAt = &now
	_, err := r.db.ExecContext(ctx, query, user.Name, user.Email, user.Role, user.UpdatedAt, user.ID)
	return err
}

func (r *UserRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM users WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
