package api

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/internal/mikrotik"
	"github.com/net-backend/internal/users"
	"github.com/net-backend/pkg"
)

type Handler struct {
	service         Service
	userService     users.IUserService
	terminalService TerminalService
	redisClient     *redis.Client
}

func NewHandler(service Service, userService users.IUserService, terminalService TerminalService, redisClient *redis.Client) *Handler {
	return &Handler{service: service, userService: userService, terminalService: terminalService, redisClient: redisClient}
}

func (h *Handler) getUserFromContext(c *fiber.Ctx) (users.Users, error) {
	claims := c.Locals("user")
	userClaims, ok := claims.(jwt.MapClaims)
	if !ok {
		return users.Users{}, pkg.NewError("User not authenticated")
	}
	userID, ok := userClaims["id"].(float64)
	if !ok {
		return users.Users{}, pkg.NewError("Invalid user ID")
	}
	user, err := h.userService.FindById(c.Context(), int(userID))
	if err != nil {
		return users.Users{}, err
	}
	return *user, nil
}

func (h *Handler) FindAll(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routers, err := h.service.FindAll(c.Context(), user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       routers,
	})
}

func (h *Handler) Create(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	var router mikrotik.Router
	if err := c.BodyParser(&router); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if validationErrors := router.Validate(); len(validationErrors) > 0 {
		return pkg.NewErrorValidation(c, validationErrors)
	}

	if err := h.service.Create(c.Context(), &router, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       router,
	})
}

func (h *Handler) ExecuteTerminalCommand(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	var req TerminalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if validationErrors := h.validateTerminalRequest(&req); len(validationErrors) > 0 {
		return pkg.NewErrorValidation(c, validationErrors)
	}

	result, err := h.terminalService.ExecuteCommands(c.Context(), &req, user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       result,
	})
}

func (h *Handler) validateTerminalRequest(req *TerminalRequest) []pkg.ValidationError {
	var errors []pkg.ValidationError

	if req.RouterID <= 0 {
		errors = append(errors, pkg.ValidationError{Field: "router_id", Message: "Router ID must be positive"})
	}

	if len(req.Commands) == 0 {
		errors = append(errors, pkg.ValidationError{Field: "commands", Message: "At least one command is required"})
	} else if len(req.Commands) > 50 {
		errors = append(errors, pkg.ValidationError{Field: "commands", Message: "Maximum 50 commands allowed"})
	}

	if req.Timeout < 0 || req.Timeout > 300 {
		errors = append(errors, pkg.ValidationError{Field: "timeout", Message: "Timeout must be between 0 and 300 seconds"})
	}

	return errors
}

func (h *Handler) Update(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	var req mikrotik.RouterUpdate
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	req.ID = routerID

	if validationErrors := req.Validate(); len(validationErrors) > 0 {
		return pkg.NewErrorValidation(c, validationErrors)
	}

	router := mikrotik.Router{
		ID:        req.ID,
		Name:      req.Name,
		Host:      req.Host,
		Port:      req.Port,
		Username:  req.Username,
		Password:  req.Password,
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
	}

	if err := h.service.Update(c.Context(), &router, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Router updated successfully",
		Data:       router,
	})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	if err := h.service.Delete(c.Context(), routerID, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Router deleted successfully",
	})
}

func (h *Handler) GetResources(c *fiber.Ctx) error {
	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	cacheKey := "mikrotik:resources:" + strconv.Itoa(routerID)
	resourceDataStr, err := h.redisClient.Get(c.Context(), cacheKey)
	if err != nil {
		// Return empty data with cache flag instead of 404
		// This improves perceived performance while waiting for WebSocket data
		return c.Status(fiber.StatusOK).JSON(pkg.Response{
			StatusCode: fiber.StatusOK,
			Message:    "Resource data not yet available",
			Data: map[string]interface{}{
				"cpu-load":        "0",
				"free-memory":     "0",
				"total-memory":    "0",
				"free-hdd-space":  "0",
				"total-hdd-space": "0",
				"uptime":          "0s",
				"board-name":      "Unknown",
				"version":         "Unknown",
				"_cached":         false,
				"_message":        "Waiting for initial data from router",
			},
		})
	}

	var resourceData map[string]interface{}
	if err := json.Unmarshal([]byte(resourceDataStr), &resourceData); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Failed to parse resource data",
		})
	}

	// Add cache flag
	if resourceData != nil {
		resourceData["_cached"] = true
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       resourceData,
	})
}

func (h *Handler) GetInterfaces(c *fiber.Ctx) error {
	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	cacheKey := "mikrotik:interfaces:" + strconv.Itoa(routerID)
	cached, err := h.redisClient.Get(c.Context(), cacheKey)
	if err != nil {
		// Cache not yet populated — return empty list, not an error
		return c.Status(fiber.StatusOK).JSON(pkg.Response{
			StatusCode: fiber.StatusOK,
			Message:    "Interface data not yet available",
			Data:       []interface{}{},
		})
	}

	var interfaces []interface{}
	if err := json.Unmarshal([]byte(cached), &interfaces); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Failed to parse interface data",
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       interfaces,
	})
}

func (h *Handler) PingRouter(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	result, err := h.service.PingRouter(c.Context(), routerID, user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       result,
	})
}

func (h *Handler) UpdateRouterStatus(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	var req struct {
		Status string `json:"status" validate:"required,oneof=up down unknown"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if err := h.service.UpdateRouterStatus(c.Context(), routerID, req.Status, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Router status updated successfully",
	})
}

func (h *Handler) ToggleRouterActive(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	if err := h.service.ToggleRouterActive(context.Background(), routerID, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Status aktif router berhasil diubah",
	})
}

func (h *Handler) UpdateCoordinates(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	var req struct {
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	router, err := h.service.FindById(c.Context(), routerID, user)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Router not found",
		})
	}

	router.Latitude = req.Latitude
	router.Longitude = req.Longitude

	if err := h.service.Update(c.Context(), router, user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Koordinat router berhasil diperbarui",
		Data:       router,
	})
}

func (h *Handler) ForcePingUpdate(c *fiber.Ctx) error {
	user, err := h.getUserFromContext(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Unauthorized",
		})
	}

	routerIDStr := c.Params("id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router ID",
		})
	}

	router, err := h.service.FindById(c.Context(), routerID, user)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Router not found",
		})
	}

	// Don't force ping inactive routers
	if !router.IsActive {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Cannot ping inactive router",
		})
	}

	// Update status to Pinging first to show it's being checked
	if updateErr := h.service.UpdateRouterStatus(c.Context(), routerID, "Pinging", user); updateErr != nil {
		log.Printf("[FORCE-PING] Failed to set status to Pinging for router %d: %v", routerID, updateErr)
	}

	// Ping asynchronously
	go func() {
		log.Printf("[FORCE-PING] Starting forced ping for router %d (%s)", routerID, router.Name)
		pingCtx, pingCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer pingCancel()

		result, pingErr := h.service.PingRouter(pingCtx, routerID, user)
		if pingErr != nil {
			log.Printf("[FORCE-PING] Ping failed for router %d: %v", routerID, pingErr)
			return
		}

		status := "down"
		if result.Success {
			status = "up"
		}

		updateCtx, updateCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer updateCancel()

		if updateErr := h.service.UpdateRouterStatus(updateCtx, routerID, status, user); updateErr != nil {
			log.Printf("[FORCE-PING] Failed to update status for router %d: %v", routerID, updateErr)
		} else {
			log.Printf("[FORCE-PING] Router %d status updated to %s", routerID, status)
		}
	}()

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Ping update initiated",
	})
}
