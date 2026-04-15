package static

import (
	"github.com/gofiber/fiber/v2"
)

func RegisterStaticRoutes(app fiber.Router, handler *Handler, authMiddleware fiber.Handler) {
	staticGroup := app.Group("/mikrotik/:router_id/static")
	staticGroup.Use(authMiddleware)

	staticGroup.Get("/", handler.FindAll)
	staticGroup.Post("/", handler.Create)
	staticGroup.Post("/sync", handler.Sync)
	staticGroup.Get("/hotspot-servers", handler.GetHotspotServers)
	staticGroup.Post("/hotspot-servers", handler.CreateHotspotServer)
	staticGroup.Get("/:id", handler.FindByID)
	staticGroup.Put("/:id", handler.Update)
	staticGroup.Delete("/:id", handler.Delete)
	staticGroup.Post("/:id/block", handler.Block)
	staticGroup.Post("/:id/unblock", handler.Unblock)
}
