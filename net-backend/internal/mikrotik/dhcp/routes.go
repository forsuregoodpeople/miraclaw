package dhcp

import (
	"github.com/gofiber/fiber/v2"
)

func RegisterDHCPRoutes(app fiber.Router, handler *Handler, authMiddleware fiber.Handler) {
	dhcpGroup := app.Group("/mikrotik/:router_id/dhcp")
	dhcpGroup.Use(authMiddleware)

	dhcpGroup.Get("/servers", handler.GetServers)
	dhcpGroup.Get("/pools", handler.GetIPPools)
	dhcpGroup.Post("/pools", handler.CreateIPPool)
	dhcpGroup.Post("/servers", handler.CreateServer)
	dhcpGroup.Post("/sync", handler.Sync)
	dhcpGroup.Get("/", handler.FindAll)
	dhcpGroup.Post("/", handler.Create)
	dhcpGroup.Get("/:id", handler.FindByID)
	dhcpGroup.Put("/:id", handler.Update)
	dhcpGroup.Delete("/:id", handler.Delete)
	dhcpGroup.Post("/:id/disable", handler.Disable)
	dhcpGroup.Post("/:id/enable", handler.Enable)
	dhcpGroup.Post("/:id/block", handler.Block)
	dhcpGroup.Post("/:id/make-static", handler.MakeStatic)
	dhcpGroup.Post("/:id/make-dynamic", handler.MakeDynamic)
}
