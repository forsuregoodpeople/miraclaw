package pppoe

import "time"

type Secret struct {
	ID            int        `json:"id"`
	RouterID      int        `json:"router_id"`
	MikrotikID    string     `json:"mikrotik_id"` // RouterOS internal .id (e.g., *1, *2)
	Name          string     `json:"name"`
	Password      string     `json:"password"`
	Profile       string     `json:"profile"`
	Service       string     `json:"service"`
	LocalAddress  string     `json:"local_address"`
	RemoteAddress string     `json:"remote_address"`
	Comment       string     `json:"comment"`
	Disabled      bool       `json:"disabled"`
	LastSyncedAt  *time.Time `json:"last_synced_at"`
	SyncStatus    string     `json:"sync_status"` // synced, pending, error, not_found
}

type Profile struct {
	Name           string `json:"name"`
	LocalAddress   string `json:"local_address"`
	RemoteAddress  string `json:"remote_address"`
	RateLimit      string `json:"rate_limit"`
	Bridge         string `json:"bridge"`
	IncomingFilter string `json:"incoming_filter"`
	OutgoingFilter string `json:"outgoing_filter"`
}
