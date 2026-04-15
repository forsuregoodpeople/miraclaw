package packages

import "time"

// Package is a named label that references a MikroTik profile.
// MikroTik is the single source of truth — all bandwidth config lives there.
// This record only stores metadata (display name, labels, sync timestamps).
//
// Source:
//   "auto"   – created/updated by SyncProfiles; mirrors MikroTik
//   "manual" – created by admin (legacy; no longer created by UI)
type Package struct {
	ID                  int        `json:"id"`
	Name                string     `json:"name"`
	Description         string     `json:"description,omitempty"`
	ConnectionType      string     `json:"connection_type"` // PPPOE | DHCP | STATIC
	RouterID            int        `json:"router_id"`
	MikrotikProfileName string     `json:"mikrotik_profile_name"`
	Source              string     `json:"source"`                    // auto | manual
	IsActive            bool       `json:"is_active"`
	LastSyncedAt        *time.Time `json:"last_synced_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// PackageWithSyncStatus extends Package with the last drift-check result.
type PackageWithSyncStatus struct {
	Package
	LastSyncStatus string     `json:"last_sync_status,omitempty"`
	LastCheckedAt  *time.Time `json:"last_checked_at,omitempty"`
}

// SyncLog records one drift-check result for a package.
type SyncLog struct {
	ID             int       `json:"id"`
	PackageID      int       `json:"package_id"`
	CheckedAt      time.Time `json:"checked_at"`
	Status         string    `json:"status"` // ok | mismatch | missing
	StoredValue    string    `json:"stored_value,omitempty"`
	MikrotikActual string    `json:"mikrotik_actual,omitempty"`
}

// ProfileSyncResult summarises one full profile-import run for a router.
type ProfileSyncResult struct {
	RouterID int    `json:"router_id"`
	Created  int    `json:"created"`
	Updated  int    `json:"updated"`
	Inactive int    `json:"inactive"`
	Total    int    `json:"total"`
	SyncedAt string `json:"synced_at"`
}

// SyncCheckResult summarises one drift-check run across all packages for a router.
type SyncCheckResult struct {
	Total    int `json:"total"`
	OK       int `json:"ok"`
	Mismatch int `json:"mismatch"`
	Missing  int `json:"missing"`
}

// UpdateLabelRequest — only the display name and description are editable by the admin.
// Profile name and connection type are immutable; they come from MikroTik.
type UpdateLabelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// CreatePackageRequest is kept for the legacy manual path.
type CreatePackageRequest struct {
	Name                string `json:"name"`
	Description         string `json:"description"`
	ConnectionType      string `json:"connection_type"`
	RouterID            int    `json:"router_id"`
	MikrotikProfileName string `json:"mikrotik_profile_name"`
}

// UpdatePackageRequest is the old shape kept so existing wiring compiles.
type UpdatePackageRequest = UpdateLabelRequest
