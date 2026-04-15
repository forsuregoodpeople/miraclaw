package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/pkg"
)

type WebsocketHandler struct {
	hub         *Hub
	redisClient *redis.Client
}

func NewWebsocketHandler(hub *Hub, redisClient *redis.Client) *WebsocketHandler {
	return &WebsocketHandler{hub: hub, redisClient: redisClient}
}

func (h *WebsocketHandler) Upgrade(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("allowed", true)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

func (h *WebsocketHandler) handleWS(c *websocket.Conn, deviceType string) {
	routerIDStr := c.Params("router_id")
	if routerIDStr == "" {
		log.Printf("[WebSocket] ERROR: Missing router_id parameter from %s", c.RemoteAddr())
		c.WriteJSON(map[string]interface{}{"error": "Missing router_id parameter"})
		c.Close()
		return
	}

	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		log.Printf("[WebSocket] ERROR: Invalid router_id format '%s' from %s: %v", routerIDStr, c.RemoteAddr(), err)
		c.WriteJSON(map[string]interface{}{"error": "Invalid router_id format"})
		c.Close()
		return
	}

	log.Printf("[WebSocket] Client connecting for router %d [%s] from %s", routerID, deviceType, c.RemoteAddr())

	deviceID := strconv.Itoa(routerID)
	client := h.hub.NewClient(c, deviceType, deviceID)
	h.hub.register <- client

	<-client.done
}

func (h *WebsocketHandler) HandleResources(c *websocket.Conn) {
	log.Printf("[WebSocket] Resources handler called, remote: %s", c.RemoteAddr())
	h.handleWS(c, "mikrotik_resources")
}

func (h *WebsocketHandler) HandleInterfaces(c *websocket.Conn) {
	h.handleWS(c, "mikrotik")
}

func (h *WebsocketHandler) HandlePPPOE(c *websocket.Conn) {
	h.handleWS(c, "mikrotik_pppoe")
}

func (h *WebsocketHandler) HandleDHCP(c *websocket.Conn) {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err == nil && h.redisClient != nil {
		cacheKey := fmt.Sprintf("mikrotik:dhcp:%d", routerID)
		if cached, err := h.redisClient.Get(context.Background(), cacheKey); err == nil && cached != "" {
			var leases interface{}
			if json.Unmarshal([]byte(cached), &leases) == nil {
				msg := map[string]interface{}{"type": "dhcp_update", "data": leases}
				if b, err := json.Marshal(msg); err == nil {
					c.WriteMessage(1, b)
				}
			}
		}
	}
	h.handleWS(c, "mikrotik_dhcp")
}

func (h *WebsocketHandler) HandleStatic(c *websocket.Conn) {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err == nil && h.redisClient != nil {
		cacheKey := fmt.Sprintf("mikrotik:static:%d", routerID)
		if cached, err := h.redisClient.Get(context.Background(), cacheKey); err == nil && cached != "" {
			var bindings interface{}
			if json.Unmarshal([]byte(cached), &bindings) == nil {
				msg := map[string]interface{}{"type": "static_update", "data": bindings}
				if b, err := json.Marshal(msg); err == nil {
					c.WriteMessage(1, b)
				}
			}
		}
	}
	h.handleWS(c, "mikrotik_static")
}

func (h *WebsocketHandler) HandleConnection(c *websocket.Conn) {
	remoteAddr := c.RemoteAddr().String()
	log.Printf("WebSocket: general client connected from %s", remoteAddr)

	client := h.hub.NewClient(c, "client", remoteAddr)
	h.hub.register <- client

	<-client.done
}

func (h *WebsocketHandler) GetStats(c *fiber.Ctx) error {
	stats := h.hub.GetStats()
	return c.JSON(stats)
}

func (h *WebsocketHandler) ClearBuffer(c *fiber.Ctx) error {
	count := h.hub.ClearBuffer()
	return c.JSON(map[string]interface{}{
		"message":          "Buffer cleared",
		"cleared_messages": count,
		"timestamp":        time.Now().Unix(),
	})
}

func (h *WebsocketHandler) ResetStats(c *fiber.Ctx) error {
	h.hub.ResetStats()
	return c.JSON(map[string]interface{}{
		"message":   "Statistics reset",
		"timestamp": time.Now().Unix(),
	})
}

func (h *WebsocketHandler) GetDebugStatus(c *fiber.Ctx) error {
	stats := h.hub.GetStats()
	return c.JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Debug status retrieved",
		Data:       stats,
	})
}
