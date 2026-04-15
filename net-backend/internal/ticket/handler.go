package ticket

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service ITicketService
}

func NewHandler(service ITicketService) *Handler {
	return &Handler{service: service}
}

// POST /v1/tickets
func (h *Handler) CreateTicket(c *fiber.Ctx) error {
	var req CreateTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "invalid request body",
		})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	t, err := h.service.CreateTicket(c.Context(), req, actorID, actorName)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{StatusCode: fiber.StatusCreated, Data: t})
}

// GET /v1/tickets
func (h *Handler) GetTickets(c *fiber.Ctx) error {
	filters := TicketFilters{
		Status:   c.Query("status"),
		Category: c.Query("category"),
	}
	if id, err := strconv.Atoi(c.Query("assigned_to")); err == nil {
		filters.AssignedTo = id
	}
	if c.Query("overdue") == "true" {
		filters.Overdue = true
	}

	tickets, err := h.service.GetTickets(c.Context(), filters)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: tickets})
}

// GET /v1/tickets/overdue
func (h *Handler) GetOverdue(c *fiber.Ctx) error {
	tickets, err := h.service.GetTickets(c.Context(), TicketFilters{Overdue: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: tickets})
}

// GET /v1/tickets/:id
func (h *Handler) GetTicket(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	t, err := h.service.GetTicket(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: t})
}

// POST /v1/tickets/check-duplicate
func (h *Handler) CheckDuplicate(c *fiber.Ctx) error {
	var body struct {
		CustomerID  *int   `json:"customer_id"`
		MikrotikRef string `json:"mikrotik_ref"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}

	result, err := h.service.CheckDuplicate(c.Context(), body.CustomerID, body.MikrotikRef)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: result})
}

// PUT /v1/tickets/:id/assign
func (h *Handler) AssignTicket(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	var req AssignTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	if err := h.service.AssignTicket(c.Context(), id, req, actorID, actorName); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "tiket berhasil di-assign"})
}

// PUT /v1/tickets/:id/status
func (h *Handler) UpdateStatus(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	var req UpdateStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	if err := h.service.UpdateStatus(c.Context(), id, req, actorID, actorName); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "status berhasil diperbarui"})
}

// PUT /v1/tickets/:id
func (h *Handler) UpdateTicket(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	var req UpdateTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	t, err := h.service.UpdateTicket(c.Context(), id, req, actorID, actorName)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "tiket berhasil diperbarui", Data: t})
}

// DELETE /v1/tickets/:id
func (h *Handler) DeleteTicket(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	if err := h.service.DeleteTicket(c.Context(), id, actorID, actorName); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "tiket berhasil dihapus"})
}

// POST /v1/tickets/:id/comments
func (h *Handler) AddComment(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	var req AddCommentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}

	actorID := pkg.UserID(c)
	actorName := pkg.UserName(c)

	if err := h.service.AddComment(c.Context(), id, req, actorID, actorName); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "komentar berhasil ditambahkan"})
}

// GET /v1/tickets/:id/timeline
func (h *Handler) GetTimeline(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid id"})
	}
	entries, err := h.service.GetTimeline(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: entries})
}
