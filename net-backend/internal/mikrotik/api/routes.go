package api

import (
	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/session"
)

func RegisterRoutes(app *fiber.App, handler *Handler, sessionMiddleware *session.Middleware) {
	v1 := app.Group("v1")

	mikrotikGroup := v1.Group("/mikrotik")
	mikrotikGroup.Use(sessionMiddleware.Auth())

	mikrotikGroup.Get("/", handler.FindAll)
	mikrotikGroup.Post("/", handler.Create)
	mikrotikGroup.Post("/terminal", sessionMiddleware.Role("superadmin", "mitra"), handler.ExecuteTerminalCommand)
	mikrotikGroup.Get("/:id/resources", handler.GetResources)
	mikrotikGroup.Get("/:id/interfaces", handler.GetInterfaces)
	mikrotikGroup.Get("/:id/ping", handler.PingRouter)
	mikrotikGroup.Put("/:id/status", handler.UpdateRouterStatus)
	mikrotikGroup.Put("/:id/active", handler.ToggleRouterActive)
	mikrotikGroup.Patch("/:id/coordinates", handler.UpdateCoordinates)
	mikrotikGroup.Post("/:id/force-ping", handler.ForcePingUpdate)
	mikrotikGroup.Put("/:id", handler.Update)
	mikrotikGroup.Delete("/:id", handler.Delete)
}
