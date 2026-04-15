package optical

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type Repository interface {
	// Devices
	FindAllByType(ctx context.Context, deviceType DeviceType) ([]Device, error)
	FindAllActiveONUs(ctx context.Context) ([]Device, error)
	FindByID(ctx context.Context, id int) (*Device, error)
	Create(ctx context.Context, d *Device) error
	Update(ctx context.Context, d *Device) error
	Delete(ctx context.Context, id int) error

	// Status
	InsertStatus(ctx context.Context, s *Status) error
	FindLatestStatusByDeviceID(ctx context.Context, deviceID int) (*Status, error)
	FindStatusHistory(ctx context.Context, deviceID int, limit int) ([]Status, error)
	DeleteOldStatus(ctx context.Context, olderThan time.Time) (int64, error)

	// ODP summaries
	FindODPSummaries(ctx context.Context) ([]ODPSummary, error)
	UpdateODPUsedPorts(ctx context.Context, odpID int, delta int) error

	// Alerts
	FindActiveAlerts(ctx context.Context) ([]Alert, error)
	UpsertAlert(ctx context.Context, a *Alert) error
	ResolveAlert(ctx context.Context, id int) error

	// App settings
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error

	// FiberCable CRUD
	ListFiberCables(ctx context.Context) ([]FiberCable, error)
	CreateFiberCable(ctx context.Context, c *FiberCable) (*FiberCable, error)
	UpdateFiberCable(ctx context.Context, id int, c *FiberCable) (*FiberCable, error)
	DeleteFiberCable(ctx context.Context, id int) error
}

type PostgresRepository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) Repository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) FindAllByType(ctx context.Context, deviceType DeviceType) ([]Device, error) {
	query := `
		SELECT id, name, device_type, COALESCE(serial,''), COALESCE(genieacs_id,''),
		       odp_id, COALESCE(ip_address,''), latitude, longitude, is_active,
		       COALESCE(vendor,''), COALESCE(rx_param_path,''), COALESCE(tx_param_path,''),
		       total_ports, COALESCE(used_ports,0), mikrotik_id, technician_id, COALESCE(photo_url,''),
		       created_at, updated_at
		FROM optical_devices
		WHERE device_type = $1
		ORDER BY name`

	rows, err := r.db.QueryContext(ctx, query, string(deviceType))
	if err != nil {
		return nil, fmt.Errorf("query optical devices: %w", err)
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		devices = append(devices, *d)
	}
	return devices, rows.Err()
}

func (r *PostgresRepository) FindAllActiveONUs(ctx context.Context) ([]Device, error) {
	query := `
		SELECT id, name, device_type, COALESCE(serial,''), COALESCE(genieacs_id,''),
		       odp_id, COALESCE(ip_address,''), latitude, longitude, is_active,
		       COALESCE(vendor,''), COALESCE(rx_param_path,''), COALESCE(tx_param_path,''),
		       total_ports, COALESCE(used_ports,0), mikrotik_id, technician_id, COALESCE(photo_url,''),
		       created_at, updated_at
		FROM optical_devices
		WHERE device_type = 'onu' AND is_active = TRUE AND genieacs_id != ''
		ORDER BY name`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query active ONUs: %w", err)
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		devices = append(devices, *d)
	}
	return devices, rows.Err()
}

func (r *PostgresRepository) FindByID(ctx context.Context, id int) (*Device, error) {
	query := `
		SELECT id, name, device_type, COALESCE(serial,''), COALESCE(genieacs_id,''),
		       odp_id, COALESCE(ip_address,''), latitude, longitude, is_active,
		       COALESCE(vendor,''), COALESCE(rx_param_path,''), COALESCE(tx_param_path,''),
		       total_ports, COALESCE(used_ports,0), mikrotik_id, technician_id, COALESCE(photo_url,''),
		       created_at, updated_at
		FROM optical_devices
		WHERE id = $1`

	row := r.db.QueryRowContext(ctx, query, id)
	d, err := scanDevice(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return d, err
}

func (r *PostgresRepository) Create(ctx context.Context, d *Device) error {
	query := `
		INSERT INTO optical_devices
		  (name, device_type, serial, genieacs_id, odp_id, ip_address, latitude, longitude,
		   is_active, vendor, rx_param_path, tx_param_path,
		   total_ports, used_ports, mikrotik_id, technician_id, photo_url)
		VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,NULLIF($6,''),$7,$8,$9,NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),
		        $13,$14,$15,$16,NULLIF($17,''))
		RETURNING id, created_at, updated_at`

	return r.db.QueryRowContext(ctx, query,
		d.Name, string(d.DeviceType), d.Serial, d.GenieACSID, d.ODPID,
		d.IPAddress, d.Latitude, d.Longitude, d.IsActive,
		d.Vendor, d.RxParamPath, d.TxParamPath,
		d.TotalPorts, d.UsedPorts, d.MikrotikID, d.TechnicianID, d.PhotoURL,
	).Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
}

func (r *PostgresRepository) Update(ctx context.Context, d *Device) error {
	query := `
		UPDATE optical_devices SET
		  name=$1, serial=NULLIF($2,''), genieacs_id=NULLIF($3,''), odp_id=$4,
		  ip_address=NULLIF($5,''), latitude=$6, longitude=$7, is_active=$8,
		  vendor=NULLIF($9,''), rx_param_path=NULLIF($10,''), tx_param_path=NULLIF($11,''),
		  total_ports=$12, used_ports=$13, mikrotik_id=$14, technician_id=$15, photo_url=NULLIF($16,''),
		  updated_at=CURRENT_TIMESTAMP
		WHERE id=$17
		RETURNING updated_at`

	return r.db.QueryRowContext(ctx, query,
		d.Name, d.Serial, d.GenieACSID, d.ODPID,
		d.IPAddress, d.Latitude, d.Longitude, d.IsActive,
		d.Vendor, d.RxParamPath, d.TxParamPath,
		d.TotalPorts, d.UsedPorts, d.MikrotikID, d.TechnicianID, d.PhotoURL, d.ID,
	).Scan(&d.UpdatedAt)
}

func (r *PostgresRepository) Delete(ctx context.Context, id int) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM optical_devices WHERE id = $1`, id)
	return err
}

func (r *PostgresRepository) InsertStatus(ctx context.Context, s *Status) error {
	query := `
		INSERT INTO optical_status (device_id, rx_power, tx_power, attenuation, link_status)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, polled_at`
	return r.db.QueryRowContext(ctx, query,
		s.DeviceID, s.RxPower, s.TxPower, s.Attenuation, s.LinkStatus,
	).Scan(&s.ID, &s.PolledAt)
}

func (r *PostgresRepository) FindLatestStatusByDeviceID(ctx context.Context, deviceID int) (*Status, error) {
	query := `
		SELECT id, device_id, rx_power, tx_power, attenuation, link_status, polled_at
		FROM optical_status
		WHERE device_id = $1
		ORDER BY polled_at DESC
		LIMIT 1`

	var s Status
	err := r.db.QueryRowContext(ctx, query, deviceID).Scan(
		&s.ID, &s.DeviceID, &s.RxPower, &s.TxPower, &s.Attenuation, &s.LinkStatus, &s.PolledAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *PostgresRepository) FindStatusHistory(ctx context.Context, deviceID int, limit int) ([]Status, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	query := `
		SELECT id, device_id, rx_power, tx_power, attenuation, link_status, polled_at
		FROM optical_status
		WHERE device_id = $1
		ORDER BY polled_at DESC
		LIMIT $2`

	rows, err := r.db.QueryContext(ctx, query, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var statuses []Status
	for rows.Next() {
		var s Status
		if err := rows.Scan(&s.ID, &s.DeviceID, &s.RxPower, &s.TxPower, &s.Attenuation, &s.LinkStatus, &s.PolledAt); err != nil {
			return nil, err
		}
		statuses = append(statuses, s)
	}
	return statuses, rows.Err()
}

func (r *PostgresRepository) DeleteOldStatus(ctx context.Context, olderThan time.Time) (int64, error) {
	result, err := r.db.ExecContext(ctx,
		`DELETE FROM optical_status WHERE polled_at < $1`, olderThan)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *PostgresRepository) FindODPSummaries(ctx context.Context) ([]ODPSummary, error) {
	query := `
		SELECT
		  odp.id, odp.name, odp.device_type,
		  COALESCE(odp.serial,''), COALESCE(odp.genieacs_id,''),
		  odp.odp_id, COALESCE(odp.ip_address,''), odp.latitude, odp.longitude,
		  odp.is_active, COALESCE(odp.vendor,''),
		  COALESCE(odp.rx_param_path,''), COALESCE(odp.tx_param_path,''),
		  odp.total_ports, COALESCE(odp.used_ports,0), odp.mikrotik_id, odp.technician_id, COALESCE(odp.photo_url,''),
		  odp.created_at, odp.updated_at,
		  COUNT(onu.id) AS total_onus,
		  COUNT(CASE WHEN os.link_status = 'down' THEN 1 END) AS down_onus,
		  COUNT(CASE WHEN os.link_status = 'degraded' THEN 1 END) AS degraded_onus
		FROM optical_devices odp
		LEFT JOIN optical_devices onu ON onu.odp_id = odp.id AND onu.device_type = 'onu'
		LEFT JOIN LATERAL (
		  SELECT link_status FROM optical_status
		  WHERE device_id = onu.id
		  ORDER BY polled_at DESC LIMIT 1
		) os ON TRUE
		WHERE odp.device_type = 'odp'
		GROUP BY odp.id, odp.name, odp.device_type, odp.serial, odp.genieacs_id,
		         odp.odp_id, odp.ip_address, odp.latitude, odp.longitude, odp.is_active,
		         odp.vendor, odp.rx_param_path, odp.tx_param_path,
		         odp.total_ports, odp.used_ports, odp.mikrotik_id, odp.technician_id, odp.photo_url,
		         odp.created_at, odp.updated_at
		ORDER BY odp.name`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query ODP summaries: %w", err)
	}
	defer rows.Close()

	var summaries []ODPSummary
	for rows.Next() {
		var s ODPSummary
		err := rows.Scan(
			&s.ID, &s.Name, &s.DeviceType, &s.Serial, &s.GenieACSID,
			&s.ODPID, &s.IPAddress, &s.Latitude, &s.Longitude, &s.IsActive,
			&s.Vendor, &s.RxParamPath, &s.TxParamPath,
			&s.TotalPorts, &s.UsedPorts, &s.MikrotikID, &s.TechnicianID, &s.PhotoURL,
			&s.CreatedAt, &s.UpdatedAt,
			&s.TotalONUs, &s.DownONUs, &s.DegradedONUs,
		)
		if err != nil {
			return nil, err
		}
		if s.TotalONUs > 0 {
			ratio := float64(s.DownONUs) / float64(s.TotalONUs)
			s.FaultSuspected = ratio >= 0.5
		}
		if s.TotalPorts != nil {
			s.AvailablePorts = *s.TotalPorts - s.UsedPorts
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}

func (r *PostgresRepository) FindActiveAlerts(ctx context.Context) ([]Alert, error) {
	query := `
		SELECT id, device_id, alert_type, severity, message, rx_power, last_seen_at, resolved_at, created_at
		FROM optical_alerts
		WHERE resolved_at IS NULL
		ORDER BY last_seen_at DESC`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.DeviceID, &a.AlertType, &a.Severity, &a.Message,
			&a.RxPower, &a.LastSeenAt, &a.ResolvedAt, &a.CreatedAt); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (r *PostgresRepository) UpsertAlert(ctx context.Context, a *Alert) error {
	query := `
		INSERT INTO optical_alerts (device_id, alert_type, severity, message, rx_power)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (device_id, alert_type) WHERE resolved_at IS NULL
		DO UPDATE SET
		  last_seen_at = CURRENT_TIMESTAMP,
		  message      = EXCLUDED.message,
		  rx_power     = EXCLUDED.rx_power,
		  severity     = EXCLUDED.severity
		RETURNING id, last_seen_at, created_at`
	return r.db.QueryRowContext(ctx, query,
		a.DeviceID, a.AlertType, a.Severity, a.Message, a.RxPower,
	).Scan(&a.ID, &a.LastSeenAt, &a.CreatedAt)
}

func (r *PostgresRepository) ResolveAlert(ctx context.Context, id int) error {
	result, err := r.db.ExecContext(ctx,
		`UPDATE optical_alerts SET resolved_at = CURRENT_TIMESTAMP WHERE id = $1 AND resolved_at IS NULL`, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("alert not found or already resolved")
	}
	return nil
}

// scanDevice scans a row into a Device. Accepts *sql.Row or *sql.Rows via the scanner interface.
type scanner interface {
	Scan(dest ...any) error
}

func scanDevice(row scanner) (*Device, error) {
	var d Device
	err := row.Scan(
		&d.ID, &d.Name, &d.DeviceType, &d.Serial, &d.GenieACSID,
		&d.ODPID, &d.IPAddress, &d.Latitude, &d.Longitude, &d.IsActive,
		&d.Vendor, &d.RxParamPath, &d.TxParamPath,
		&d.TotalPorts, &d.UsedPorts, &d.MikrotikID, &d.TechnicianID, &d.PhotoURL,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *PostgresRepository) UpdateODPUsedPorts(ctx context.Context, odpID int, delta int) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE optical_devices
		SET used_ports = GREATEST(0, COALESCE(used_ports, 0) + $1)
		WHERE id = $2 AND device_type = 'odp'`, delta, odpID)
	return err
}

func (r *PostgresRepository) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := r.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = $1`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (r *PostgresRepository) SetSetting(ctx context.Context, key, value string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
		key, value)
	return err
}

// --- FiberCable CRUD ---

func (r *PostgresRepository) ListFiberCables(ctx context.Context) ([]FiberCable, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, from_device_id, to_device_id, points, cable_type, color,
		       length_m, notes, created_by, created_at, updated_at
		FROM fiber_cables ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cables []FiberCable
	for rows.Next() {
		var c FiberCable
		var pointsJSON []byte
		if err := rows.Scan(&c.ID, &c.Name, &c.FromDeviceID, &c.ToDeviceID,
			&pointsJSON, &c.CableType, &c.Color,
			&c.LengthM, &c.Notes, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(pointsJSON, &c.Points); err != nil {
			c.Points = nil
		}
		cables = append(cables, c)
	}
	return cables, nil
}

func (r *PostgresRepository) CreateFiberCable(ctx context.Context, c *FiberCable) (*FiberCable, error) {
	pointsJSON, _ := json.Marshal(c.Points)
	var created FiberCable
	var pointsOut []byte
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO fiber_cables (name, from_device_id, to_device_id, points, cable_type, color, length_m, notes, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, name, from_device_id, to_device_id, points, cable_type, color, length_m, notes, created_by, created_at, updated_at
	`, c.Name, c.FromDeviceID, c.ToDeviceID, pointsJSON, c.CableType, c.Color, c.LengthM, c.Notes, c.CreatedBy).
		Scan(&created.ID, &created.Name, &created.FromDeviceID, &created.ToDeviceID,
			&pointsOut, &created.CableType, &created.Color,
			&created.LengthM, &created.Notes, &created.CreatedBy, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(pointsOut, &created.Points); err != nil {
		created.Points = c.Points
	}
	return &created, nil
}

func (r *PostgresRepository) UpdateFiberCable(ctx context.Context, id int, c *FiberCable) (*FiberCable, error) {
	pointsJSON, _ := json.Marshal(c.Points)
	var updated FiberCable
	var pointsOut []byte
	err := r.db.QueryRowContext(ctx, `
		UPDATE fiber_cables
		SET name=$1, from_device_id=$2, to_device_id=$3, points=$4,
		    cable_type=$5, color=$6, length_m=$7, notes=$8, updated_at=NOW()
		WHERE id=$9
		RETURNING id, name, from_device_id, to_device_id, points, cable_type, color, length_m, notes, created_by, created_at, updated_at
	`, c.Name, c.FromDeviceID, c.ToDeviceID, pointsJSON,
		c.CableType, c.Color, c.LengthM, c.Notes, id).
		Scan(&updated.ID, &updated.Name, &updated.FromDeviceID, &updated.ToDeviceID,
			&pointsOut, &updated.CableType, &updated.Color,
			&updated.LengthM, &updated.Notes, &updated.CreatedBy, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(pointsOut, &updated.Points); err != nil {
		updated.Points = c.Points
	}
	return &updated, nil
}

func (r *PostgresRepository) DeleteFiberCable(ctx context.Context, id int) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM fiber_cables WHERE id=$1`, id)
	return err
}
