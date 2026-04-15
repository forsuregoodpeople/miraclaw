package websocket_test

import (
	"testing"
	"time"

	fiberws "github.com/gofiber/websocket/v2"
	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/websocket"
	"github.com/stretchr/testify/assert"
)

func TestHubConfig_Default(t *testing.T) {
	hubConfig := config.DefaultHubConfig()

	assert.Equal(t, 1024, hubConfig.BufferSize)
	assert.Equal(t, 30*time.Second, hubConfig.PingInterval)
	assert.Equal(t, 60*time.Second, hubConfig.PongWait)
	assert.Equal(t, 10*time.Second, hubConfig.WriteWait)
}

func TestHub_GetStats_Empty(t *testing.T) {
	hubConfig := config.DefaultHubConfig()
	hub := websocket.NewHub(hubConfig)

	stats := hub.GetStats()

	assert.NotNil(t, stats)
	assert.Equal(t, int64(0), stats["total_clients"])
	assert.Equal(t, int64(0), stats["total_devices"])
	assert.Equal(t, int64(0), stats["messages_sent"])
	assert.Equal(t, int64(0), stats["messages_dropped"])
	assert.NotNil(t, stats["uptime"])
	assert.Equal(t, hubConfig.BufferSize, stats["buffer_size"])
}

func TestHub_Broadcast(t *testing.T) {
	hubConfig := config.DefaultHubConfig()
	hub := websocket.NewHub(hubConfig)

	deviceType := "mikrotik"
	deviceID := "1"
	testData := map[string]interface{}{
		"name":    "ether1",
		"type":    "ether",
		"running": true,
	}

	hub.Broadcast(deviceType, deviceID, testData)

	time.Sleep(50 * time.Millisecond)

	stats := hub.GetStats()
	assert.NotNil(t, stats)
}

func TestHub_NewClient(t *testing.T) {
	hubConfig := config.DefaultHubConfig()
	hub := websocket.NewHub(hubConfig)

	conn := &fiberws.Conn{}
	deviceType := "mikrotik"
	deviceID := "1"

	client := hub.NewClient(conn, deviceType, deviceID)

	assert.NotNil(t, client)
}

func TestHubConfig_Custom(t *testing.T) {
	hubConfig := config.HubConfig{
		BufferSize:   2048,
		PingInterval: 60 * time.Second,
		PongWait:     120 * time.Second,
		WriteWait:    20 * time.Second,
	}

	hub := websocket.NewHub(hubConfig)

	assert.NotNil(t, hub)

	stats := hub.GetStats()
	assert.Equal(t, 2048, stats["buffer_size"])
}
