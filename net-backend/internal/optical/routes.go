package optical

import "github.com/gofiber/fiber/v2"

func RegisterRoutes(v1 fiber.Router, h *Handler, authMiddleware fiber.Handler) {
	g := v1.Group("/optical")
	g.Use(authMiddleware)

	// GenieACS proxy + settings
	g.Get("/genieacs/devices", h.ListGenieACSDevices)
	g.Get("/genieacs/devices/*", h.GetGenieACSDevice)
	g.Post("/genieacs/devices/*/import", h.ImportGenieACSDevice)
	g.Get("/genieacs/settings", h.GetGenieACSSettings)
	g.Put("/genieacs/settings", h.UpdateGenieACSSettings)

	// OLT
	g.Get("/olt", h.ListOLT)
	g.Post("/olt", h.CreateOLT)
	g.Get("/olt/:id", h.GetDevice)
	g.Put("/olt/:id", h.UpdateDevice)
	g.Delete("/olt/:id", h.DeleteDevice)

	// ODP
	g.Get("/odp", h.ListODP)
	g.Post("/odp", h.CreateODP)
	g.Get("/odp/:id", h.GetDevice)
	g.Put("/odp/:id", h.UpdateDevice)
	g.Delete("/odp/:id", h.DeleteDevice)
	g.Post("/odp/:id/ports", h.AdjustODPPorts)
	g.Post("/odp/:id/photo", h.UploadODPPhoto)

	// ONU
	g.Get("/onu", h.ListONU)
	g.Post("/onu", h.CreateONU)
	g.Get("/onu/:id", h.GetDevice)
	g.Put("/onu/:id", h.UpdateDevice)
	g.Delete("/onu/:id", h.DeleteDevice)
	g.Get("/onu/:id/history", h.GetStatusHistory)

	// Alerts
	g.Get("/alerts", h.ListAlerts)
	g.Put("/alerts/:id/resolve", h.ResolveAlert)

	// Fiber cables
	g.Get("/cables", h.ListFiberCables)
	g.Post("/cables", h.CreateFiberCable)
	g.Put("/cables/:id", h.UpdateFiberCable)
	g.Delete("/cables/:id", h.DeleteFiberCable)
}
