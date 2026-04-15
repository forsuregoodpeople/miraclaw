package customer

import "time"

type Customer struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`                   // PPPOE | DHCP | STATIC
	RouterID     *int      `json:"router_id"`
	MikrotikRef  string    `json:"mikrotik_ref,omitempty"` // e.g. "pppoe-5"
	Email        string    `json:"email,omitempty"`
	WaNumber     string    `json:"wa_number,omitempty"`
	PhotoURL     string    `json:"photo_url,omitempty"`
	Address      string    `json:"address,omitempty"`
	Note         string    `json:"note,omitempty"`
	IsActive     bool      `json:"is_active"`
	PackageID    *int      `json:"package_id,omitempty"`
	PackageName  string    `json:"package_name,omitempty"`
	Latitude     *float64  `json:"latitude,omitempty"`
	Longitude    *float64  `json:"longitude,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type UpdateCoordinatesRequest struct {
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

type CreateCustomerRequest struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	RouterID    *int   `json:"router_id"`
	MikrotikRef string `json:"mikrotik_ref"`
	Email       string `json:"email,omitempty"`
	WaNumber    string `json:"wa_number"`
	Address     string `json:"address"`
	Note        string `json:"note"`
	PackageID   *int   `json:"package_id"` // optional: auto-assign package on create
}

type UpdateCustomerRequest struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Email    string `json:"email,omitempty"`
	Password string `json:"password"` // plain text; service hashes it before storing
	WaNumber string `json:"wa_number"`
	Address  string `json:"address"`
	Note     string `json:"note"`
}

type ImportRow struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	MikrotikRef string `json:"mikrotik_ref"`
	Profile     string `json:"-"` // MikroTik profile name; used to auto-assign package_id on sync
	HasComment  bool   `json:"-"` // true when the Mikrotik Comment field is non-empty
}

type ImportCustomersRequest struct {
	RouterID  int         `json:"router_id"`
	Customers []ImportRow `json:"customers"`
}

type ImportResult struct {
	Created int `json:"created"`
	Skipped int `json:"skipped"`
}

type SyncResult struct {
	Created     int `json:"created"`
	Updated     int `json:"updated"`
	Total       int `json:"total"`
	Deactivated int `json:"deactivated"`
}
