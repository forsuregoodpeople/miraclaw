package ticket

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(app fiber.Router, h *Handler, authMiddleware fiber.Handler) {
	g := app.Group("/tickets")
	g.Use(authMiddleware)

	g.Get("/overdue", h.GetOverdue)
	g.Get("/", h.GetTickets)
	g.Post("/", h.CreateTicket)
	g.Post("/check-duplicate", h.CheckDuplicate)
	g.Get("/:id", h.GetTicket)
	g.Put("/:id", h.UpdateTicket)
	g.Delete("/:id", h.DeleteTicket)
	g.Put("/:id/assign", h.AssignTicket)
	g.Put("/:id/status", h.UpdateStatus)
	g.Post("/:id/comments", h.AddComment)
	g.Get("/:id/timeline", h.GetTimeline)
}
