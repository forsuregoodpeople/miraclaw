package static

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service IStaticService
}

func NewStaticHandler(service IStaticService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) FindAll(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	bindings, err := h.service.GetAllBindings(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       bindings,
	})
}

func (h *Handler) FindByID(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	binding, err := h.service.GetBindingByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       binding,
	})
}

func (h *Handler) Create(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	var binding StaticBinding
	if err := c.BodyParser(&binding); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	result, err := h.service.CreateBinding(c.Context(), &binding, routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       result,
	})
}

func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	var binding StaticBinding
	if err := c.BodyParser(&binding); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	binding.ID = id
	if err := h.service.UpdateBinding(c.Context(), &binding); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       binding,
	})
}

func (h *Handler) Block(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	if err := h.service.BlockBinding(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Static binding blocked successfully",
	})
}

func (h *Handler) Unblock(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	if err := h.service.UnblockBinding(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Static binding unblocked successfully",
	})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	if err := h.service.DeleteBinding(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Static binding deleted successfully",
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

	bindings, err := h.service.SyncFromRouter(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       bindings,
	})
}

func (h *Handler) GetHotspotServers(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	servers, err := h.service.GetHotspotServers(c.Context(), routerID)
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

func (h *Handler) CreateHotspotServer(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	var server HotspotServer
	if err := c.BodyParser(&server); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if err := h.service.CreateHotspotServer(c.Context(), routerID, &server); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Message:    "Hotspot server created successfully",
	})
}
