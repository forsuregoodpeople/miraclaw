package websocket

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/net-backend/internal/session"
)

func RegisterRoutes(app *fiber.App, wsHandler *WebsocketHandler, sessionMiddleware *session.Middleware) {
	v1 := app.Group("v1")

	wsGroup := v1.Group("/ws")
	wsGroup.Use(sessionMiddleware.Auth())
	wsGroup.Use(wsHandler.Upgrade)

	wsGroup.Get("", websocket.New(wsHandler.HandleConnection))
	wsGroup.Get("/interfaces/:router_id", websocket.New(wsHandler.HandleInterfaces))
	wsGroup.Get("/resources/:router_id", websocket.New(wsHandler.HandleResources))
	wsGroup.Get("/pppoe/:router_id", websocket.New(wsHandler.HandlePPPOE))
	wsGroup.Get("/dhcp/:router_id", websocket.New(wsHandler.HandleDHCP))
	wsGroup.Get("/static/:router_id", websocket.New(wsHandler.HandleStatic))

	rootWsGroup := app.Group("/ws")
	rootWsGroup.Use(sessionMiddleware.Auth())
	rootWsGroup.Use(wsHandler.Upgrade)
	rootWsGroup.Get("", websocket.New(wsHandler.HandleConnection))
	rootWsGroup.Get("/interfaces/:router_id", websocket.New(wsHandler.HandleInterfaces))
	rootWsGroup.Get("/resources/:router_id", websocket.New(wsHandler.HandleResources))
	rootWsGroup.Get("/pppoe/:router_id", websocket.New(wsHandler.HandlePPPOE))
	rootWsGroup.Get("/dhcp/:router_id", websocket.New(wsHandler.HandleDHCP))
	rootWsGroup.Get("/static/:router_id", websocket.New(wsHandler.HandleStatic))

	mgmtGroup := v1.Group("/ws-management")
	mgmtGroup.Use(sessionMiddleware.Auth())

	mgmtGroup.Get("/stats", wsHandler.GetStats)
	mgmtGroup.Post("/clear-buffer", wsHandler.ClearBuffer)
	mgmtGroup.Post("/reset-stats", wsHandler.ResetStats)

	debugGroup := v1.Group("/debug")
	debugGroup.Use(sessionMiddleware.Auth())
	debugGroup.Get("/websocket-status", wsHandler.GetDebugStatus)
}
