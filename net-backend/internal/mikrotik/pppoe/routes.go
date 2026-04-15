package pppoe

import (
	"github.com/gofiber/fiber/v2"
)

func RegisterRoutes(app fiber.Router, handler *Handler, authMiddleware fiber.Handler) {
	pppoeGroup := app.Group("/mikrotik/:router_id/pppoe")
	pppoeGroup.Use(authMiddleware)

	pppoeGroup.Get("/", handler.FindAll)
	pppoeGroup.Post("/sync", handler.Sync)
	pppoeGroup.Post("/", handler.Create)
	pppoeGroup.Get("/sessions", handler.GetSessions)
	pppoeGroup.Get("/profiles", handler.GetProfiles)
	pppoeGroup.Get("/:id", handler.FindById)
	pppoeGroup.Put("/:id", handler.Update)
	pppoeGroup.Delete("/:id", handler.Delete)
	pppoeGroup.Post("/:id/block", handler.Block)
	pppoeGroup.Post("/:id/unblock", handler.Unblock)
	pppoeGroup.Post("/disconnect", handler.DisconnectSession)
}
