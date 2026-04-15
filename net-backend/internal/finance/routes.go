package finance

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(app fiber.Router, h *Handler, authMiddleware fiber.Handler) {
	g := app.Group("/finance")
	g.Use(authMiddleware)

	g.Get("/payments", h.GetPayments)
	g.Post("/payments", h.CreatePayment)
	g.Put("/payments/:id", h.UpdatePayment)
	g.Delete("/payments/:id", h.DeletePayment)
	g.Get("/invoices", h.GetInvoices)
	g.Post("/invoices", h.CreateInvoice)
	g.Post("/invoices/bulk", h.CreateBulkInvoices)
	g.Put("/invoices/:id", h.UpdateInvoice)
	g.Delete("/invoices/:id", h.DeleteInvoice)
	g.Put("/invoices/:id/paid", h.MarkInvoicePaid)
	g.Get("/summary", h.GetSummary)
	g.Get("/tariff", h.GetTariff)
	g.Put("/tariff", h.UpsertTariff)
}
