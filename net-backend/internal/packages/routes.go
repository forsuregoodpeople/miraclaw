package packages

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(app fiber.Router, h *Handler, authMiddleware fiber.Handler) {
	g := app.Group("/packages")
	g.Use(authMiddleware)

	g.Get("/", h.GetAll)
	g.Post("/", h.Create)
	g.Post("/sync/:router_id", h.Sync)
	g.Post("/sync-import/:router_id", h.SyncImport)
	g.Delete("/unassign/:customer_id", h.Unassign)
	g.Get("/:id", h.GetByID)
	g.Put("/:id", h.Update)
	g.Delete("/:id", h.Delete)
	g.Post("/:id/assign/:customer_id", h.Assign)
	g.Get("/:id/sync-logs", h.GetSyncLogs)
}
