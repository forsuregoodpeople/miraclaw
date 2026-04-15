package static

type StaticBinding struct {
	ID         int    `json:"id"`
	RouterID   int    `json:"router_id"`
	Address    string `json:"address"`
	MACAddress string `json:"mac_address"`
	Server     string `json:"server"`
	Type       string `json:"type"`
	ToAddress  string `json:"to_address"`
	Comment    string `json:"comment"`
	IsDisabled bool   `json:"is_disabled"`
	IsOnline   bool   `json:"is_online"`
	LastSeen   string `json:"last_seen"`
	UpdatedAt  string `json:"updated_at"`
}

type HotspotServer struct {
	Name        string `json:"name"`
	Interface   string `json:"interface"`
	AddressPool string `json:"address_pool"`
	Profile     string `json:"profile"`
	IdleTimeout string `json:"idle_timeout"`
}
