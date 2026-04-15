package packages

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service     IPackageService
	userService users.IUserService
}

func NewHandler(service IPackageService, userService users.IUserService) *Handler {
	return &Handler{service: service, userService: userService}
}

// getMitraID resolves the effective mitra owner ID for the calling user.
// Returns nil for superadmin (no filter). Returns an error if the user cannot be loaded.
func (h *Handler) getMitraID(c *fiber.Ctx) (*int, error) {
	role := pkg.UserRole(c)
	if role == users.RoleSuperAdmin {
		return nil, nil
	}
	userID := pkg.UserID(c)
	if role == users.RoleMitra {
		return &userID, nil
	}
	// admin / teknisi: look up parent_id from DB
	u, err := h.userService.FindById(c.Context(), userID)
	if err != nil {
		return nil, err
	}
	if u.ParentID != nil {
		return u.ParentID, nil
	}
	return &userID, nil
}

// GET /v1/packages?router_id=1&type=PPPOE
func (h *Handler) GetAll(c *fiber.Ctx) error {
	mitraID, err := h.getMitraID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{StatusCode: fiber.StatusUnauthorized, Message: "Unauthorized"})
	}

	var routerID *int
	if v := c.Query("router_id"); v != "" {
		id, err := strconv.Atoi(v)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid router_id"})
		}
		routerID = &id
	}
	connType := strings.ToUpper(c.Query("type"))

	list, err := h.service.GetAll(c.Context(), routerID, connType, mitraID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: list})
}

// GET /v1/packages/:id
func (h *Handler) GetByID(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid package id"})
	}
	p, err := h.service.GetByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: p})
}

// POST /v1/packages
func (h *Handler) Create(c *fiber.Ctx) error {
	var req CreatePackageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	p, err := h.service.Create(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{StatusCode: fiber.StatusCreated, Data: p})
}

func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid package id"})
	}
	var req UpdatePackageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	p, err := h.service.Update(c.Context(), id, req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: p})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid package id"})
	}
	if err := h.service.Delete(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "package deleted"})
}

func (h *Handler) Assign(c *fiber.Ctx) error {
	packageID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid package id"})
	}
	customerID, err := strconv.Atoi(c.Params("customer_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	if err := h.service.AssignToCustomer(c.Context(), packageID, customerID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "package assigned"})
}

// DELETE /v1/packages/unassign/:customer_id
func (h *Handler) Unassign(c *fiber.Ctx) error {
	customerID, err := strconv.Atoi(c.Params("customer_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid customer id"})
	}
	if err := h.service.UnassignFromCustomer(c.Context(), customerID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "package unassigned"})
}

// POST /v1/packages/sync/:router_id
func (h *Handler) Sync(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil || routerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid router_id"})
	}
	result, err := h.service.CheckSync(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: result})
}

// POST /v1/packages/sync-import/:router_id
func (h *Handler) SyncImport(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil || routerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid router_id"})
	}
	result, err := h.service.SyncProfiles(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	// Run CheckSync immediately so sync logs are populated for the Log button.
	_, _ = h.service.CheckSync(c.Context(), routerID)
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: result})
}

// GET /v1/packages/:id/sync-logs?limit=20
func (h *Handler) GetSyncLogs(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid package id"})
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	logs, err := h.service.GetSyncLogs(c.Context(), id, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{StatusCode: fiber.StatusInternalServerError, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: logs})
}
