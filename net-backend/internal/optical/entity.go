package optical

import "time"

type DeviceType string

const (
	DeviceTypeOLT DeviceType = "olt"
	DeviceTypeODP DeviceType = "odp"
	DeviceTypeONU DeviceType = "onu"
)

type Device struct {
	ID           int        `json:"id"`
	Name         string     `json:"name"`
	DeviceType   DeviceType `json:"device_type"`
	Serial       string     `json:"serial,omitempty"`
	GenieACSID   string     `json:"genieacs_id,omitempty"`
	ODPID        *int       `json:"odp_id,omitempty"`
	IPAddress    string     `json:"ip_address,omitempty"`
	Latitude     *float64   `json:"latitude,omitempty"`
	Longitude    *float64   `json:"longitude,omitempty"`
	IsActive     bool       `json:"is_active"`
	Vendor       string     `json:"vendor,omitempty"`
	RxParamPath  string     `json:"rx_param_path,omitempty"`
	TxParamPath  string     `json:"tx_param_path,omitempty"`
	// ODP-specific fields
	TotalPorts   *int       `json:"total_ports,omitempty"`
	UsedPorts    int        `json:"used_ports,omitempty"`
	MikrotikID   *int       `json:"mikrotik_id,omitempty"`
	TechnicianID *int       `json:"technician_id,omitempty"`
	PhotoURL     string     `json:"photo_url,omitempty"`
	CreatedAt    *time.Time `json:"created_at,omitempty"`
	UpdatedAt    *time.Time `json:"updated_at,omitempty"`
	LatestStatus *Status    `json:"latest_status,omitempty"`
}

type Status struct {
	ID          int       `json:"id"`
	DeviceID    int       `json:"device_id"`
	RxPower     *float64  `json:"rx_power"`
	TxPower     *float64  `json:"tx_power"`
	Attenuation *float64  `json:"attenuation"`
	LinkStatus  string    `json:"link_status"`
	PolledAt    time.Time `json:"polled_at"`
}

type Alert struct {
	ID         int        `json:"id"`
	DeviceID   int        `json:"device_id"`
	AlertType  string     `json:"alert_type"`
	Severity   string     `json:"severity"`
	Message    string     `json:"message"`
	RxPower    *float64   `json:"rx_power,omitempty"`
	LastSeenAt time.Time  `json:"last_seen_at"`
	ResolvedAt *time.Time `json:"resolved_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type ODPSummary struct {
	Device
	TotalONUs       int  `json:"total_onus"`
	DownONUs        int  `json:"down_onus"`
	DegradedONUs    int  `json:"degraded_onus"`
	FaultSuspected  bool `json:"fault_suspected"`
	AvailablePorts  int  `json:"available_ports"`
}

type StatusUpdate struct {
	Type      string  `json:"type"`
	DeviceID  int     `json:"device_id"`
	Status    Status  `json:"status"`
	Timestamp string  `json:"timestamp"`
}

// GenieACSSettings holds the connection config for GenieACS NBI.
type GenieACSSettings struct {
	URL      string `json:"url"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
}

// GenieACSDevice represents a device as seen in GenieACS NBI
type GenieACSDevice struct {
	ID           string                 `json:"_id"`
	LastInform   string                 `json:"_lastInform,omitempty"`
	Tags         []string               `json:"_tags,omitempty"`
	DeviceID     map[string]interface{} `json:"DeviceID,omitempty"`
	Manufacturer string                 `json:"manufacturer,omitempty"`
	ProductClass string                 `json:"product_class,omitempty"`
	SerialNumber string                 `json:"serial_number,omitempty"`
}

// FiberCable represents a manually drawn fiber optic cable on the map
type FiberCable struct {
	ID           int          `json:"id"`
	Name         string       `json:"name"`
	FromDeviceID *int         `json:"from_device_id,omitempty"`
	ToDeviceID   *int         `json:"to_device_id,omitempty"`
	Points       [][2]float64 `json:"points"`
	CableType    string       `json:"cable_type"`
	Color        string       `json:"color"`
	LengthM      *int         `json:"length_m,omitempty"`
	Notes        string       `json:"notes"`
	CreatedBy    *int         `json:"created_by,omitempty"`
	CreatedAt    *time.Time   `json:"created_at,omitempty"`
	UpdatedAt    *time.Time   `json:"updated_at,omitempty"`
}
