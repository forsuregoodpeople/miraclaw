package dhcp

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service IDHCPService
}

func NewDHCPHandler(service IDHCPService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetServers(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	servers, err := h.service.GetServers(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       servers,
	})
}

func (h *Handler) GetIPPools(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	pools, err := h.service.GetIPPools(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       pools,
	})
}

func (h *Handler) CreateIPPool(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	type CreatePoolRequest struct {
		Name     string `json:"name"`
		Ranges   string `json:"ranges"`
		NextPool string `json:"next_pool"`
	}

	var req CreatePoolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if req.Name == "" || req.Ranges == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "name dan ranges wajib diisi",
		})
	}

	if err := h.service.CreateIPPool(c.Context(), routerID, req.Name, req.Ranges, req.NextPool); err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "from RouterOS device:") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Message:    "IP Pool berhasil dibuat",
	})
}

func (h *Handler) CreateServer(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	var server DHCPServer
	if err := c.BodyParser(&server); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if err := h.service.CreateServer(c.Context(), routerID, &server); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Message:    "DHCP server created successfully",
	})
}

func (h *Handler) FindAll(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	leases, err := h.service.GetAllLeases(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       leases,
	})
}

func (h *Handler) FindByID(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	lease, err := h.service.GetLeaseByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       lease,
	})
}

func (h *Handler) Create(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	var lease DHCPLease
	if err := c.BodyParser(&lease); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	result, err := h.service.CreateLease(c.Context(), &lease, routerID)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       result,
	})
}

func (h *Handler) Update(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	var lease DHCPLease
	if err := c.BodyParser(&lease); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	lease.ID = id

	err = h.service.UpdateLease(c.Context(), &lease)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       lease,
	})
}

func (h *Handler) Disable(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.DisableLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease disabled successfully",
	})
}

func (h *Handler) Enable(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.EnableLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease enabled successfully",
	})
}

func (h *Handler) MakeStatic(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.MakeStaticLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease made static successfully",
	})
}

func (h *Handler) MakeDynamic(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.MakeDynamicLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease made dynamic successfully",
	})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.DeleteLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease deleted successfully",
	})
}

func (h *Handler) Block(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	err = h.service.BlockLease(c.Context(), id)
	if err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "already have") || strings.Contains(err.Error(), "failure:") || strings.Contains(err.Error(), "invalid value") || strings.Contains(err.Error(), "from RouterOS device:") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "DHCP lease blocked successfully",
	})
}

func (h *Handler) Sync(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	leases, err := h.service.SyncFromMikrotik(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       leases,
	})
}
