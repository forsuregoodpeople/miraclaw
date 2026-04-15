package pelanggan

type Pelanggan struct {
	ID         string `json:"id"`          // "{type}-{originalID}"
	Name       string `json:"name"`
	Type       string `json:"type"`        // "DHCP" | "STATIC" | "PPPOE"
	IP         string `json:"ip"`
	Username   string `json:"username"`    // PPPoE name; empty for DHCP/STATIC
	MAC        string `json:"mac"`
	Status     string `json:"status"`      // "UP" | "DOWN"
	IsIsolir   bool   `json:"is_isolir"`   // true when customer is isolated/blocked
	LastSeen   string `json:"last_seen"`
	RouterID   int    `json:"router_id"`
	OriginalID int    `json:"original_id"` // DB primary key for action deep-links
	Comment    string `json:"comment"`
	Profile    string `json:"profile"`     // MikroTik profile name (PPPoE); empty for DHCP/STATIC
}
