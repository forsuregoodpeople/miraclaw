package mikrotik_test

import (
	"testing"
	"time"

	"github.com/net-backend/internal/mikrotik"
)

func TestRouter_Validate_Success(t *testing.T) {
	now := time.Now()
	router := mikrotik.Router{
		Name:      "Test Router",
		Host:      "10.10.10.1",
		Port:      8728,
		Username:  "admin",
		Password:  "123",
		MitraID:   1,
		CreatedAt: &now,
		UpdatedAt: &now,
	}

	errors := router.Validate()

	if len(errors) > 0 {
		t.Errorf("Expected no validation errors, got %d", len(errors))
	}
}

func TestRouter_Validate_RequiredFields(t *testing.T) {
	tests := []struct {
		name    string
		router  mikrotik.Router
		wantErr bool
	}{
		{
			name:    "Missing name",
			router:  mikrotik.Router{Host: "10.10.10.1", Port: 8728, Username: "admin", Password: "123", MitraID: 1},
			wantErr: true,
		},
		{
			name:    "Missing host",
			router:  mikrotik.Router{Name: "Test", Port: 8728, Username: "admin", Password: "123", MitraID: 1},
			wantErr: true,
		},
		{
			name:    "Missing port",
			router:  mikrotik.Router{Name: "Test", Host: "10.10.10.1", Username: "admin", Password: "123", MitraID: 1},
			wantErr: true,
		},
		{
			name:    "Missing username",
			router:  mikrotik.Router{Name: "Test", Host: "10.10.10.1", Port: 8728, Password: "123", MitraID: 1},
			wantErr: true,
		},
		{
			name:    "Missing password",
			router:  mikrotik.Router{Name: "Test", Host: "10.10.10.1", Port: 8728, Username: "admin", MitraID: 1},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errors := tt.router.Validate()
			hasError := len(errors) > 0

			if hasError != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", errors, tt.wantErr)
			}
		})
	}
}

func TestRouter_Validate_PortRange(t *testing.T) {
	tests := []struct {
		name    string
		port    int
		wantErr bool
	}{
		{"Valid port 22", 22, false},
		{"Valid port 80", 80, false},
		{"Valid port 8728", 8728, false},
		{"Valid port 65535", 65535, false},
		{"Invalid port 0", 0, true},
		{"Invalid port -1", -1, true},
		{"Invalid port 65536", 65536, true},
		{"Invalid port 100000", 100000, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			router := mikrotik.Router{
				Name:      "Test Router",
				Host:      "10.10.10.1",
				Port:      tt.port,
				Username:  "admin",
				Password:  "123",
				MitraID:   1,
				CreatedAt: &now,
				UpdatedAt: &now,
			}

			errors := router.Validate()
			hasError := len(errors) > 0

			if hasError != tt.wantErr {
				t.Errorf("Validate() port = %d, error = %v, wantErr %v", tt.port, errors, tt.wantErr)
			}
		})
	}
}

func TestRouter_Validate_HostFormat(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		wantErr bool
	}{
		{"Valid IP 10.10.10.1", "10.10.10.1", false},
		{"Valid IP 192.168.1.1", "192.168.1.1", false},
		{"Valid IP 172.16.0.1", "172.16.0.1", false},
		{"Valid localhost", "localhost", false},
		{"Valid hostname", "router.example.com", false},
		{"Invalid IP 10.10.10", "10.10.10", true},
		{"Invalid IP 10.10.10.300", "10.10.10.300", true},
		{"Empty host", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			router := mikrotik.Router{
				Name:      "Test Router",
				Host:      tt.host,
				Port:      8728,
				Username:  "admin",
				Password:  "123",
				MitraID:   1,
				CreatedAt: &now,
				UpdatedAt: &now,
			}

			errors := router.Validate()
			hasError := len(errors) > 0

			if hasError != tt.wantErr {
				t.Errorf("Validate() host = %s, error = %v, wantErr %v", tt.host, errors, tt.wantErr)
			}
		})
	}
}
