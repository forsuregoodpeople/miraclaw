package customer

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(app fiber.Router, h *Handler, authMiddleware fiber.Handler) {
	g := app.Group("/customers")
	g.Use(authMiddleware)

	g.Get("/", h.GetAll)
	g.Post("/import", h.Import)
	g.Post("/sync/:router_id", h.Sync)
	g.Post("/", h.Create)
	g.Patch("/:id/coordinates", h.UpdateCoordinates)
	g.Post("/:id/photo", h.UploadPhoto)
	g.Get("/:id", h.GetByID)
	g.Put("/:id", h.Update)
	g.Delete("/:id", h.Delete)
}
