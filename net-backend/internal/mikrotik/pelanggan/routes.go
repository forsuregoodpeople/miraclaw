package pelanggan

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(app fiber.Router, handler *Handler, authMiddleware fiber.Handler) {
	g := app.Group("/mikrotik/:router_id/pelanggan")
	g.Use(authMiddleware)
	g.Get("/", handler.GetAll)
	g.Post("/:type/:id/isolir", handler.Isolir)
	g.Post("/:type/:id/unisolir", handler.UnIsolir)
	g.Post("/:type/:id/block", handler.Block)
}
