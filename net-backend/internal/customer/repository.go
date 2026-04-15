package customer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type ICustomerRepository interface {
	GetAll(ctx context.Context, routerID *int, search string, activeOnly bool) ([]Customer, error)
	GetByID(ctx context.Context, id int) (*Customer, error)
	Create(ctx context.Context, req CreateCustomerRequest) (*Customer, error)
	Update(ctx context.Context, id int, req UpdateCustomerRequest, passwordHash string) (*Customer, error)
	Delete(ctx context.Context, id int) error
	BulkImport(ctx context.Context, routerID int, rows []ImportRow) (created, skipped int, err error)
	BulkUpsert(ctx context.Context, routerID int, rows []ImportRow) (created, updated int, err error)
	DeactivateMissing(ctx context.Context, routerID int, presentRefs []string) (int, error)
	UpdateCoordinates(ctx context.Context, id int, lat, lng *float64) (*Customer, error)
	UpdatePhotoURL(ctx context.Context, id int, photoURL string) error
}

type repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) ICustomerRepository {
	return &repository{db: db}
}

// selectCols uses table alias "c" — all queries must alias customers as c.
const selectCols = `
	c.id, c.name, c.type, c.router_id,
	COALESCE(c.mikrotik_ref,''), COALESCE(c.email,''), COALESCE(c.wa_number,''),
	COALESCE(c.photo_url,''), COALESCE(c.address,''), COALESCE(c.note,''),
	c.is_active, c.package_id, COALESCE(p.name,''), c.created_at, c.updated_at,
	c.latitude, c.longitude`

func scanCustomer(s interface{ Scan(...any) error }, c *Customer) error {
	return s.Scan(
		&c.ID, &c.Name, &c.Type, &c.RouterID,
		&c.MikrotikRef, &c.Email, &c.WaNumber,
		&c.PhotoURL, &c.Address, &c.Note,
		&c.IsActive, &c.PackageID, &c.PackageName,
		&c.CreatedAt, &c.UpdatedAt,
		&c.Latitude, &c.Longitude,
	)
}

func (r *repository) GetAll(ctx context.Context, routerID *int, search string, activeOnly bool) ([]Customer, error) {
	query := `SELECT` + selectCols + `
		FROM customers c
		LEFT JOIN packages p ON p.id = c.package_id
		WHERE ($1::INTEGER IS NULL OR c.router_id = $1)
		  AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.mikrotik_ref ILIKE '%' || $2 || '%')
		  AND (NOT $3 OR c.is_active = TRUE)
		ORDER BY c.name ASC`

	rows, err := r.db.QueryContext(ctx, query, routerID, search, activeOnly)
	if err != nil {
		return nil, fmt.Errorf("GetAll customers: %w", err)
	}
	defer rows.Close()

	var list []Customer
	for rows.Next() {
		var c Customer
		if err := scanCustomer(rows, &c); err != nil {
			return nil, fmt.Errorf("GetAll scan: %w", err)
		}
		list = append(list, c)
	}
	if list == nil {
		list = []Customer{}
	}
	return list, rows.Err()
}

func (r *repository) GetByID(ctx context.Context, id int) (*Customer, error) {
	c := &Customer{}
	err := scanCustomer(
		r.db.QueryRowContext(ctx, `SELECT`+selectCols+`
			FROM customers c
			LEFT JOIN packages p ON p.id = c.package_id
			WHERE c.id = $1`, id),
		c,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("customer not found")
		}
		return nil, fmt.Errorf("GetByID: %w", err)
	}
	return c, nil
}

func (r *repository) Create(ctx context.Context, req CreateCustomerRequest) (*Customer, error) {
	c := &Customer{}
	err := scanCustomer(
		r.db.QueryRowContext(ctx, `
			WITH inserted AS (
				INSERT INTO customers (name, type, router_id, mikrotik_ref, email, wa_number, address, note)
				VALUES ($1, $2, NULLIF($3::INTEGER, 0), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,''))
				RETURNING *
			)
			SELECT`+selectCols+`
			FROM inserted c
			LEFT JOIN packages p ON p.id = c.package_id`,
			req.Name, req.Type, req.RouterID, req.MikrotikRef,
			req.Email, req.WaNumber, req.Address, req.Note,
		),
		c,
	)
	if err != nil {
		return nil, fmt.Errorf("Create customer: %w", err)
	}
	return c, nil
}

func (r *repository) Update(ctx context.Context, id int, req UpdateCustomerRequest, passwordHash string) (*Customer, error) {
	c := &Customer{}
	err := scanCustomer(
		r.db.QueryRowContext(ctx, `
			WITH updated AS (
				UPDATE customers
				SET name=$1, type=$2,
				    email=NULLIF($3,''), wa_number=NULLIF($4,''),
				    password_hash=CASE WHEN $5='' THEN password_hash ELSE $5 END,
				    address=NULLIF($6,''), note=NULLIF($7,''),
				    updated_at=NOW()
				WHERE id=$8
				RETURNING *
			)
			SELECT`+selectCols+`
			FROM updated c
			LEFT JOIN packages p ON p.id = c.package_id`,
			req.Name, req.Type,
			req.Email, req.WaNumber, passwordHash,
			req.Address, req.Note, id,
		),
		c,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("customer not found")
		}
		return nil, fmt.Errorf("Update customer: %w", err)
	}
	return c, nil
}

func (r *repository) Delete(ctx context.Context, id int) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE customers SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND is_active=TRUE`, id)
	if err != nil {
		return fmt.Errorf("Delete customer: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("customer not found")
	}
	return nil
}

func (r *repository) BulkImport(ctx context.Context, routerID int, rows []ImportRow) (created, skipped int, err error) {
	for _, row := range rows {
		var wasInsert bool
		execErr := r.db.QueryRowContext(ctx, `
			INSERT INTO customers (name, type, router_id, mikrotik_ref)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (mikrotik_ref) WHERE mikrotik_ref IS NOT NULL DO UPDATE
			  SET is_active  = TRUE,
			      router_id  = EXCLUDED.router_id,
			      updated_at = NOW()
			RETURNING (xmax = 0)`,
			row.Name, row.Type, routerID, row.MikrotikRef,
		).Scan(&wasInsert)
		if execErr != nil {
			err = fmt.Errorf("BulkImport insert: %w", execErr)
			return
		}
		if wasInsert {
			created++
		} else {
			skipped++
		}
	}
	return
}

func (r *repository) BulkUpsert(ctx context.Context, routerID int, rows []ImportRow) (created, updated int, err error) {
	for _, row := range rows {
		var isInsert bool
		execErr := r.db.QueryRowContext(ctx, `
			INSERT INTO customers (name, type, router_id, mikrotik_ref, package_id)
			VALUES ($1, $2::VARCHAR, $3, $4,
			  CASE WHEN $6 != '' THEN (
			    SELECT id FROM packages
			    WHERE router_id = $3::INTEGER AND connection_type = $2::VARCHAR
			      AND mikrotik_profile_name = $6 AND is_active = TRUE
			    LIMIT 1
			  ) ELSE NULL END
			)
			ON CONFLICT (mikrotik_ref) WHERE mikrotik_ref IS NOT NULL DO UPDATE
			  SET name       = CASE WHEN $5 THEN EXCLUDED.name ELSE customers.name END,
			      type       = EXCLUDED.type,
			      router_id  = EXCLUDED.router_id,
			      package_id = COALESCE(EXCLUDED.package_id, customers.package_id),
			      is_active  = TRUE,
			      updated_at = NOW()
			RETURNING (xmax = 0)`,
			row.Name, row.Type, routerID, row.MikrotikRef, row.HasComment, row.Profile,
		).Scan(&isInsert)
		if execErr != nil {
			err = fmt.Errorf("BulkUpsert: %w", execErr)
			return
		}
		if isInsert {
			created++
		} else {
			updated++
		}
	}
	return
}

func (r *repository) DeactivateMissing(ctx context.Context, routerID int, presentRefs []string) (int, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE customers
		SET is_active = FALSE, updated_at = NOW()
		WHERE router_id = $1
		  AND is_active = TRUE
		  AND mikrotik_ref IS NOT NULL
		  AND mikrotik_ref != ALL($2)`,
		routerID, presentRefs,
	)
	if err != nil {
		return 0, fmt.Errorf("DeactivateMissing: %w", err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

func (r *repository) UpdateCoordinates(ctx context.Context, id int, lat, lng *float64) (*Customer, error) {
	c := &Customer{}
	err := scanCustomer(
		r.db.QueryRowContext(ctx, `
			WITH updated AS (
				UPDATE customers
				SET latitude=$1, longitude=$2, updated_at=NOW()
				WHERE id=$3
				RETURNING *
			)
			SELECT`+selectCols+`
			FROM updated c
			LEFT JOIN packages p ON p.id = c.package_id`,
			lat, lng, id,
		),
		c,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("customer not found")
	}
	if err != nil {
		return nil, fmt.Errorf("UpdateCoordinates: %w", err)
	}
	return c, nil
}

func (r *repository) UpdatePhotoURL(ctx context.Context, id int, photoURL string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE customers SET photo_url=$1, updated_at=NOW() WHERE id=$2`, photoURL, id)
	if err != nil {
		return fmt.Errorf("UpdatePhotoURL: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("customer not found")
	}
	return nil
}
