package pelanggan

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetAll(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	list, err := h.service.GetAll(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       list,
	})
}

func (h *Handler) Isolir(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	pelangganType := strings.ToUpper(c.Params("type"))

	if err := h.service.Isolir(c.Context(), pelangganType, id); err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusNotFound
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Pelanggan berhasil diisolir",
	})
}

func (h *Handler) Block(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	pelangganType := strings.ToUpper(c.Params("type"))

	if err := h.service.Block(c.Context(), routerID, pelangganType, id); err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusNotFound
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Pelanggan berhasil diblokir dan diputus",
	})
}

func (h *Handler) UnIsolir(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	pelangganType := strings.ToUpper(c.Params("type"))

	if err := h.service.UnIsolir(c.Context(), pelangganType, id); err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "no such item") {
			status = fiber.StatusNotFound
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Isolir pelanggan berhasil dilepas",
	})
}
