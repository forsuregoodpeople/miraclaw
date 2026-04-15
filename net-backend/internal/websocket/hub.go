package websocket

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/net-backend/internal/config"
	"github.com/net-backend/pkg/logger"
	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
)

type Hub struct {
	clients       map[string]map[*Client]bool
	subscriptions map[*Client]map[string]bool // client -> set of deviceKeys
	register      chan *Client
	unregister    chan *Client
	broadcast     chan *BroadcastMessage
	mu            sync.RWMutex
	bufferSize    int
	numWorkers    int
	hubConfig     config.HubConfig
	stats         *HubStats
	stopChan      chan struct{}
	stopOnce      sync.Once
}

type Client struct {
	deviceType     string
	deviceID       string
	conn           *websocket.Conn
	send           chan []byte
	hub            *Hub
	closed         sync.Once
	unregisterOnce sync.Once
	done           chan struct{}
}

type BroadcastMessage struct {
	DeviceType string
	DeviceID   string
	Data       interface{}
}

type HubStats struct {
	TotalClients    int64
	TotalDevices    int64
	MessagesSent    int64
	MessagesDropped int64
	StartTime       time.Time
	mu              sync.RWMutex
}

func NewHub(config config.HubConfig) *Hub {
	numWorkers := config.NumWorkers
	if numWorkers < 1 {
		numWorkers = 1
	}

	return &Hub{
		clients:       make(map[string]map[*Client]bool),
		subscriptions: make(map[*Client]map[string]bool),
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		broadcast:     make(chan *BroadcastMessage, config.BufferSize),
		bufferSize:    config.BufferSize,
		numWorkers:    numWorkers,
		hubConfig:     config,
		stats: &HubStats{
			StartTime: time.Now(),
		},
		stopChan: make(chan struct{}),
	}
}

func (h *Hub) broadcastWorker(workerID int) {
	for {
		select {
		case <-h.stopChan:
			return
		case message := <-h.broadcast:
			h.handleBroadcast(message)
		}
	}
}

func (h *Hub) Run() {
	logger.Log.WithFields(logrus.Fields{
		"component":   "websocket_hub",
		"buffer_size": h.bufferSize,
		"num_workers": h.numWorkers,
	}).Info("WebSocket hub started")

	for i := 0; i < h.numWorkers; i++ {
		go h.broadcastWorker(i)
	}

	for {
		select {
		case <-h.stopChan:
			logger.Log.WithField("component", "websocket_hub").Info("WebSocket hub stopping")
			return
		case client := <-h.register:
			h.handleRegister(client)
		case client := <-h.unregister:
			h.handleUnregister(client)
		}
	}
}

func (h *Hub) Stop() {
	h.stopOnce.Do(func() {
		close(h.stopChan)
	})
}

func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	deviceKey := client.deviceType + ":" + client.deviceID

	if _, exists := h.clients[deviceKey]; !exists {
		h.clients[deviceKey] = make(map[*Client]bool)
		h.stats.mu.Lock()
		h.stats.TotalDevices++
		h.stats.mu.Unlock()
		logger.Log.WithFields(logrus.Fields{
			"component":  "websocket_hub",
			"device_key": deviceKey,
			"action":     "new_device",
		}).Info("New device registered")
	}

	h.clients[deviceKey][client] = true
	h.stats.mu.Lock()
	h.stats.TotalClients++
	h.stats.mu.Unlock()

	h.subscriptions[client] = make(map[string]bool)
	h.subscriptions[client][deviceKey] = true

	logger.Log.WithFields(logrus.Fields{
		"component":     "websocket_hub",
		"device_key":    deviceKey,
		"device_type":   client.deviceType,
		"device_id":     client.deviceID,
		"total_clients": len(h.clients[deviceKey]),
		"remote_addr":   client.conn.RemoteAddr().String(),
	}).Info("Client registered")

	go client.writePump(h.hubConfig)
	go client.readPump(h.hubConfig)
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if deviceKeys, exists := h.subscriptions[client]; exists {
		subscribedCount := len(deviceKeys)
		for deviceKey := range deviceKeys {
			if deviceClients, ok := h.clients[deviceKey]; ok {
				if _, clientExists := deviceClients[client]; clientExists {
					delete(deviceClients, client)
					h.stats.mu.Lock()
					h.stats.TotalClients--
					h.stats.mu.Unlock()

					if len(deviceClients) == 0 {
						delete(h.clients, deviceKey)
						h.stats.mu.Lock()
						h.stats.TotalDevices--
						h.stats.mu.Unlock()
					}
				}
			}
		}
		delete(h.subscriptions, client)
		logger.Log.WithFields(logrus.Fields{
			"component":        "websocket_hub",
			"device_type":      client.deviceType,
			"device_id":        client.deviceID,
			"subscribed_count": subscribedCount,
		}).Info("Client unregistered")
	} else {
		logger.Log.WithFields(logrus.Fields{
			"component":   "websocket_hub",
			"device_type": client.deviceType,
			"device_id":   client.deviceID,
		}).Debug("Client unregistered (no subscriptions)")
	}

	client.closed.Do(func() {
		close(client.send)
		close(client.done)
	})
}

func (h *Hub) handleBroadcast(message *BroadcastMessage) {
	deviceKey := message.DeviceType + ":" + message.DeviceID

	h.mu.RLock()
	clientMap, exists := h.clients[deviceKey]
	if !exists {
		h.mu.RUnlock()
		logger.Log.WithFields(logrus.Fields{
			"component":  "websocket_hub",
			"device_key": deviceKey,
			"reason":     "no_clients",
		}).Debug("No clients for device, skipping broadcast")
		return
	}
	// Copy client pointers under the lock to avoid racing with unregister.
	snapshot := make([]*Client, 0, len(clientMap))
	for c := range clientMap {
		snapshot = append(snapshot, c)
	}
	h.mu.RUnlock()

	jsonData, err := json.Marshal(message.Data)
	if err != nil {
		logger.Log.WithFields(logrus.Fields{
			"component":  "websocket_hub",
			"device_key": deviceKey,
			"error":      err.Error(),
		}).Error("Failed to marshal broadcast message")
		return
	}

	logger.Log.WithFields(logrus.Fields{
		"component":    "websocket_hub",
		"device_key":   deviceKey,
		"client_count": len(snapshot),
		"message_size": len(jsonData),
	}).Debug("Broadcasting message to clients")

	for _, client := range snapshot {
		select {
		case <-client.done:
			// Client already closed; skip to avoid send on closed channel.
		case client.send <- jsonData:
			h.stats.mu.Lock()
			h.stats.MessagesSent++
			h.stats.mu.Unlock()
		default:
			h.stats.mu.Lock()
			h.stats.MessagesDropped++
			h.stats.mu.Unlock()

			logger.Log.WithFields(logrus.Fields{
				"component":   "websocket_hub",
				"device_key":  deviceKey,
				"reason":      "client_buffer_full",
				"buffer_size": len(client.send),
			}).Warn("Client buffer full, dropping message")
		}
	}
}

func (h *Hub) Subscribe(client *Client, deviceType, deviceID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	deviceKey := deviceType + ":" + deviceID
	if _, exists := h.clients[deviceKey]; !exists {
		h.clients[deviceKey] = make(map[*Client]bool)
		h.stats.mu.Lock()
		h.stats.TotalDevices++
		h.stats.mu.Unlock()
	}

	if !h.clients[deviceKey][client] {
		h.clients[deviceKey][client] = true
		h.stats.mu.Lock()
		h.stats.TotalClients++
		h.stats.mu.Unlock()
	}

	if h.subscriptions[client] == nil {
		h.subscriptions[client] = make(map[string]bool)
	}
	h.subscriptions[client][deviceKey] = true

	logger.Log.WithFields(logrus.Fields{
		"component":     "websocket_hub",
		"device_key":    deviceKey,
		"device_type":   deviceType,
		"device_id":     deviceID,
		"total_clients": len(h.clients[deviceKey]),
	}).Info("Client subscribed to device")
}

func (h *Hub) Unsubscribe(client *Client, deviceType, deviceID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	deviceKey := deviceType + ":" + deviceID
	if deviceClients, exists := h.clients[deviceKey]; exists {
		if _, clientExists := deviceClients[client]; clientExists {
			delete(deviceClients, client)
			h.stats.mu.Lock()
			h.stats.TotalClients--
			h.stats.mu.Unlock()

			if len(deviceClients) == 0 {
				delete(h.clients, deviceKey)
				h.stats.mu.Lock()
				h.stats.TotalDevices--
				h.stats.mu.Unlock()
			}
		}
	}

	if h.subscriptions[client] != nil {
		delete(h.subscriptions[client], deviceKey)
		if len(h.subscriptions[client]) == 0 {
			delete(h.subscriptions, client)
		}
	}

	logger.Log.WithFields(logrus.Fields{
		"component":         "websocket_hub",
		"device_key":        deviceKey,
		"device_type":       deviceType,
		"device_id":         deviceID,
		"remaining_clients": len(h.clients[deviceKey]), // 0 if device was removed
	}).Info("Client unsubscribed from device")
}

func (h *Hub) Broadcast(deviceType, deviceID string, data interface{}) {
	message := &BroadcastMessage{
		DeviceType: deviceType,
		DeviceID:   deviceID,
		Data:       data,
	}

	select {
	case h.broadcast <- message:
		logger.Log.WithFields(logrus.Fields{
			"component":   "websocket_hub",
			"device_key":  deviceType + ":" + deviceID,
			"buffer_used": len(h.broadcast),
			"buffer_size": h.bufferSize,
		}).Debug("Message queued for broadcast")
	default:
		deviceKey := deviceType + ":" + deviceID
		logger.Log.WithFields(logrus.Fields{
			"component":   "websocket_hub",
			"device_key":  deviceKey,
			"buffer_used": len(h.broadcast),
			"buffer_size": h.bufferSize,
			"reason":      "hub_buffer_full",
		}).Error("Hub broadcast buffer full, dropping message")
		h.stats.mu.Lock()
		h.stats.MessagesDropped++
		h.stats.mu.Unlock()
	}
}

func (h *Hub) NewClient(conn *websocket.Conn, deviceType, deviceID string) *Client {
	return &Client{
		conn:       conn,
		deviceType: deviceType,
		deviceID:   deviceID,
		send:       make(chan []byte, h.bufferSize),
		hub:        h,
		done:       make(chan struct{}),
	}
}

func (h *Hub) GetStats() map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()
	h.stats.mu.RLock()
	defer h.stats.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["total_clients"] = h.stats.TotalClients
	stats["total_devices"] = h.stats.TotalDevices
	stats["messages_sent"] = h.stats.MessagesSent
	stats["messages_dropped"] = h.stats.MessagesDropped
	stats["uptime"] = time.Since(h.stats.StartTime).String()
	stats["buffer_size"] = h.bufferSize
	stats["buffer_used"] = len(h.broadcast)
	stats["buffer_percentage"] = float64(len(h.broadcast)) / float64(h.bufferSize) * 100
	stats["num_workers"] = h.numWorkers

	return stats
}

func (h *Hub) isBufferNearFull() bool {
	const threshold = 0.8
	return float64(len(h.broadcast)) > float64(h.bufferSize)*threshold
}

func (h *Hub) ClearBuffer() int {
	h.mu.Lock()
	defer h.mu.Unlock()

	count := 0
	for {
		select {
		case <-h.broadcast:
			count++
		default:
			return count
		}
	}
}

func (h *Hub) ResetStats() {
	h.stats.mu.Lock()
	defer h.stats.mu.Unlock()

	h.stats.TotalClients = 0
	h.stats.TotalDevices = 0
	h.stats.MessagesSent = 0
	h.stats.MessagesDropped = 0
	h.stats.StartTime = time.Now()
}

func (h *Hub) StartRedisListener(redisPubSub *redis.PubSub) {
	ch := redisPubSub.Channel()

	logger.Log.WithField("component", "websocket_hub").Info("Redis listener started for WebSocket hub")

	go func() {
		for msg := range ch {
			var routerID int

			logger.Log.WithFields(logrus.Fields{
				"component":    "websocket_hub",
				"channel":      msg.Channel,
				"payload_size": len(msg.Payload),
			}).Debug("Received Redis message")

			switch {
			case strings.HasSuffix(msg.Channel, ":resources"):
				if _, err := fmt.Sscanf(msg.Channel, "router:%d:resources", &routerID); err == nil {
					if h.isBufferNearFull() {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"reason":    "buffer_near_full",
						}).Warn("Buffer near full, dropping resources message")
						continue
					}
					var data interface{}
					if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"error":     err.Error(),
						}).Error("Failed to unmarshal Redis resources message")
						continue
					}
					wrappedData := map[string]interface{}{
						"type":      "resource_update",
						"routerId":  routerID,
						"data":      data,
						"timestamp": time.Now().Format(time.RFC3339),
					}
					h.Broadcast("mikrotik_resources", fmt.Sprintf("%d", routerID), wrappedData)
				} else {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"channel":   msg.Channel,
					}).Error("Failed to parse resources channel")
				}

			case strings.HasSuffix(msg.Channel, ":interfaces"):
				if _, err := fmt.Sscanf(msg.Channel, "router:%d:interfaces", &routerID); err == nil {
					if h.isBufferNearFull() {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"reason":    "buffer_near_full",
						}).Warn("Buffer near full, dropping interfaces message")
						continue
					}
					var data interface{}
					if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"error":     err.Error(),
						}).Error("Failed to unmarshal Redis interfaces message")
						continue
					}
					h.Broadcast("mikrotik", fmt.Sprintf("%d", routerID), data)
				} else {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"channel":   msg.Channel,
					}).Error("Failed to parse interfaces channel")
				}

			case strings.HasSuffix(msg.Channel, ":pppoe"):
				if _, err := fmt.Sscanf(msg.Channel, "router:%d:pppoe", &routerID); err == nil {
					if h.isBufferNearFull() {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"reason":    "buffer_near_full",
						}).Warn("Buffer near full, dropping PPPoE message")
						continue
					}
					var data interface{}
					if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"error":     err.Error(),
						}).Error("Failed to unmarshal Redis PPPoE message")
						continue
					}
					h.Broadcast("mikrotik_pppoe", fmt.Sprintf("%d", routerID), data)
				} else {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"channel":   msg.Channel,
					}).Error("Failed to parse pppoe channel")
				}

			case strings.HasSuffix(msg.Channel, ":dhcp"):
				if _, err := fmt.Sscanf(msg.Channel, "router:%d:dhcp", &routerID); err == nil {
					if h.isBufferNearFull() {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"reason":    "buffer_near_full",
						}).Warn("Buffer near full, dropping DHCP message")
						continue
					}
					var data interface{}
					if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"router_id": routerID,
							"error":     err.Error(),
						}).Error("Failed to unmarshal Redis DHCP message")
						continue
					}
					h.Broadcast("mikrotik_dhcp", fmt.Sprintf("%d", routerID), data)
				} else {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"channel":   msg.Channel,
					}).Error("Failed to parse dhcp channel")
				}

			case strings.HasSuffix(msg.Channel, ":static"):
			if _, err := fmt.Sscanf(msg.Channel, "router:%d:static", &routerID); err == nil {
				if h.isBufferNearFull() {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"router_id": routerID,
						"reason":    "buffer_near_full",
					}).Warn("Buffer near full, dropping static message")
					continue
				}
				var data interface{}
				if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"router_id": routerID,
						"error":     err.Error(),
					}).Error("Failed to unmarshal Redis static message")
					continue
				}
				h.Broadcast("mikrotik_static", fmt.Sprintf("%d", routerID), data)
			} else {
				logger.Log.WithFields(logrus.Fields{
					"component": "websocket_hub",
					"channel":   msg.Channel,
				}).Error("Failed to parse static channel")
			}

		case strings.HasPrefix(msg.Channel, "optical:device:") && strings.HasSuffix(msg.Channel, ":status"):
				var deviceID int
				if _, err := fmt.Sscanf(msg.Channel, "optical:device:%d:status", &deviceID); err == nil {
					var data interface{}
					if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
						logger.Log.WithFields(logrus.Fields{
							"component": "websocket_hub",
							"channel":   msg.Channel,
							"error":     err.Error(),
						}).Error("Failed to unmarshal optical status message")
						continue
					}
					h.Broadcast("optical", fmt.Sprintf("%d", deviceID), data)
				} else {
					logger.Log.WithFields(logrus.Fields{
						"component": "websocket_hub",
						"channel":   msg.Channel,
					}).Error("Failed to parse optical channel")
				}

			default:
				logger.Log.WithFields(logrus.Fields{
					"component": "websocket_hub",
					"channel":   msg.Channel,
				}).Error("Unknown channel pattern")
			}
		}
	}()
}

func (c *Client) writePump(config config.HubConfig) {
	pingInterval := config.PingInterval
	if pingInterval <= 0 {
		pingInterval = 30 * time.Second
	}
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.unregisterOnce.Do(func() {
			c.hub.unregister <- c
		})
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(config.WriteWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				msg, ok := <-c.send
				if !ok {
					break
				}
				w.Write([]byte{'\n'})
				w.Write(msg)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(config.WriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(config config.HubConfig) {
	pongWait := config.PongWait
	if pongWait <= 0 {
		pongWait = 60 * time.Second
	}

	defer func() {
		c.unregisterOnce.Do(func() {
			c.hub.unregister <- c
		})
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			isExpectedClose := websocket.IsCloseError(err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure,
				websocket.CloseNoStatusReceived,
			)
			if isExpectedClose {
				logger.Log.WithFields(logrus.Fields{
					"component":   "websocket_hub",
					"device_type": c.deviceType,
					"device_id":   c.deviceID,
					"error":       err.Error(),
				}).Info("WebSocket client closed connection")
			} else {
				logger.Log.WithFields(logrus.Fields{
					"component":   "websocket_hub",
					"device_type": c.deviceType,
					"device_id":   c.deviceID,
					"error":       err.Error(),
				}).Warn("WebSocket unexpected read error")
			}
			break
		}

		c.handleMessage(message)
	}
}

// safeSend attempts to send on the client's send channel without panicking
// if the channel is already closed.
func (c *Client) safeSend(data []byte) {
	select {
	case <-c.done:
		return
	case c.send <- data:
	default:
		// buffer full, drop
	}
}

func (c *Client) handleMessage(message []byte) {
	var msg map[string]interface{}
	if err := json.Unmarshal(message, &msg); err != nil {
		return
	}

	if action, ok := msg["action"].(string); ok && action == "ping" {
		response := map[string]interface{}{
			"action": "pong",
			"time":   time.Now().Unix(),
		}
		jsonResp, _ := json.Marshal(response)
		c.safeSend(jsonResp)
		return
	}

	// Handle subscribe/unsubscribe messages (frontend format)
	if msgType, ok := msg["type"].(string); ok {
		switch msgType {
		case "subscribe":
			if routerIds, ok := msg["routerIds"].([]interface{}); ok {
				for _, rid := range routerIds {
					if routerID, ok := rid.(float64); ok {
						deviceType := "mikrotik_resources"
						deviceID := fmt.Sprintf("%.0f", routerID)
						c.hub.Subscribe(c, deviceType, deviceID)
					}
				}
				// Send acknowledgement
				response := map[string]interface{}{
					"type":      "subscribed",
					"routerIds": msg["routerIds"],
					"timestamp": time.Now().Unix(),
				}
				jsonResp, _ := json.Marshal(response)
				c.safeSend(jsonResp)
			}
		case "unsubscribe":
			if routerIds, ok := msg["routerIds"].([]interface{}); ok {
				for _, rid := range routerIds {
					if routerID, ok := rid.(float64); ok {
						deviceType := "mikrotik_resources"
						deviceID := fmt.Sprintf("%.0f", routerID)
						c.hub.Unsubscribe(c, deviceType, deviceID)
					}
				}
				// Send acknowledgement
				response := map[string]interface{}{
					"type":      "unsubscribed",
					"routerIds": msg["routerIds"],
					"timestamp": time.Now().Unix(),
				}
				jsonResp, _ := json.Marshal(response)
				c.safeSend(jsonResp)
			}
		}
	}
}
