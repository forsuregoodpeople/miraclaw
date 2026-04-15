package dhcp

type DHCPServer struct {
	Name        string `json:"name"`
	Interface   string `json:"interface"`
	AddressPool string `json:"address_pool"`
	LeaseTime   string `json:"lease_time"`
}

type DHCPLease struct {
	ID            int    `json:"id"`
	RouterID      int    `json:"router_id"`
	Address       string `json:"address"`
	MACAddress    string `json:"mac_address"`
	HostName      string `json:"host_name"`
	ClientID      string `json:"client_id"`
	Server        string `json:"server"`
	Status        string `json:"status"`
	ExpiresAfter  string `json:"expires_after"`
	Dynamic       bool   `json:"dynamic"`
	IsIsolir      bool   `json:"is_isolir"`
	BlockType     string `json:"block_type"` // "none" | "isolir" | "blokir"
	ActiveAddress string `json:"active_address"`
	ActiveMAC     string `json:"active_mac"`
	ActiveServer  string `json:"active_server"`
	ActiveState   bool   `json:"active_state"`
	LastSeen      string `json:"last_seen"`
	Comment       string `json:"comment"`
}
