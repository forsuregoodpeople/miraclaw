package customer

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service ICustomerService
}

func NewHandler(service ICustomerService) *Handler {
	return &Handler{service: service}
}

// GET /v1/customers?router_id=1&search=foo&active=true
func (h *Handler) GetAll(c *fiber.Ctx) error {
	var routerID *int
	if v := c.Query("router_id"); v != "" {
		id, err := strconv.Atoi(v)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid router_id"})
		}
		routerID = &id
	}
	search := c.Query("search")
	activeOnly := strings.ToLower(c.Query("active")) != "false"

	list, err := h.service.GetAll(c.Context(), routerID, search, activeOnly)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: list})
}

// GET /v1/customers/:id
func (h *Handler) GetByID(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	cust, err := h.service.GetByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: cust})
}

// POST /v1/customers
func (h *Handler) Create(c *fiber.Ctx) error {
	var req CreateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	if strings.TrimSpace(req.Name) == "" || req.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "name dan type wajib diisi"})
	}
	cust, err := h.service.Create(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{StatusCode: fiber.StatusCreated, Data: cust})
}

// PUT /v1/customers/:id
func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	var req UpdateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	if strings.TrimSpace(req.Name) == "" || req.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "name dan type wajib diisi"})
	}
	cust, err := h.service.Update(c.Context(), id, req)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: cust})
}

// DELETE /v1/customers/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	if err := h.service.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "customer deleted"})
}

// POST /v1/customers/import
func (h *Handler) Import(c *fiber.Ctx) error {
	var req ImportCustomersRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	if req.RouterID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "router_id wajib diisi"})
	}
	if len(req.Customers) == 0 {
		return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: ImportResult{}})
	}
	result, err := h.service.BulkImport(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: result})
}

// PATCH /v1/customers/:id/coordinates
func (h *Handler) UpdateCoordinates(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	var req UpdateCoordinatesRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	cust, err := h.service.UpdateCoordinates(c.Context(), id, req.Latitude, req.Longitude)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: cust})
}

// POST /v1/customers/sync/:router_id
func (h *Handler) Sync(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil || routerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid router_id"})
	}
	result, err := h.service.Sync(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: result})
}

// POST /v1/customers/:id/photo  (multipart/form-data, field "photo", max 2MB, JPG/PNG)
func (h *Handler) UploadPhoto(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	photoURL, err := h.service.UploadPhoto(c, id)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: map[string]string{"photo_url": photoURL}})
}
