package pppoe

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	redisclient "github.com/net-backend/internal/integrations/redis"
	"github.com/net-backend/pkg"
	goredis "github.com/redis/go-redis/v9"
)

type Handler struct {
	service     Service
	redisClient *redisclient.Client
	observer    *PPPOEObserver
}

func NewHandler(service Service, redisClient *redisclient.Client, observer *PPPOEObserver) *Handler {
	return &Handler{service: service, redisClient: redisClient, observer: observer}
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

	secrets, err := h.service.FindAll(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       secrets,
	})
}

func (h *Handler) FindById(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	secret, err := h.service.FindById(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       secret,
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

	var secret Secret
	if err := c.BodyParser(&secret); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	result, err := h.service.Create(c.Context(), &secret, routerID)
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
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	var secret Secret
	if err := c.BodyParser(&secret); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	secret.ID = id

	err = h.service.Update(c.Context(), &secret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       secret,
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

	err = h.service.Delete(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "PPPoE secret deleted successfully",
	})
}

func (h *Handler) DisconnectSession(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	var req struct {
		SessionName string `json:"session_name" validate:"required"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	err = h.service.DisconnectSession(c.Context(), routerID, req.SessionName)
	if err != nil {
		if errors.Is(err, ErrMikrotikItemNotFound) || 
			err.Error() == fmt.Sprintf("active session not found for user: %s", req.SessionName) || 
			err.Error() == fmt.Sprintf("session already disconnected: %s", req.SessionName) {
			return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
				StatusCode: fiber.StatusNotFound,
				Message:    err.Error(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Session disconnected successfully",
	})
}

func (h *Handler) GetSessions(c *fiber.Ctx) error {
	routerIDStr := c.Params("router_id")
	routerID, err := strconv.Atoi(routerIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}

	cacheKey := fmt.Sprintf("mikrotik:pppoe:%d", routerID)
	cached, err := h.redisClient.Get(c.Context(), cacheKey)
	if err != nil {
		if err == goredis.Nil {
			return c.Status(fiber.StatusOK).JSON(pkg.Response{
				StatusCode: fiber.StatusOK,
				Data:       []any{},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Failed to fetch sessions",
		})
	}

	var sessions []map[string]string
	if err := json.Unmarshal([]byte(cached), &sessions); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Failed to parse sessions",
		})
	}
	if sessions == nil {
		sessions = []map[string]string{}
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       sessions,
	})
}

func (h *Handler) GetProfiles(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}
	profiles, err := h.service.GetProfiles(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       profiles,
	})
}

func (h *Handler) CreateProfile(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}
	var profile Profile
	if err := c.BodyParser(&profile); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}
	if err := h.service.CreateProfile(c.Context(), routerID, &profile); err != nil {
		if errors.Is(err, ErrProfileAlreadyExists) {
			return c.Status(fiber.StatusConflict).JSON(pkg.Response{
				StatusCode: fiber.StatusConflict,
				Message:    "Profile dengan nama tersebut sudah ada",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Message:    "Profile created successfully",
	})
}

func (h *Handler) UpdateProfile(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}
	profileName := c.Params("name")
	if profileName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Profile name is required",
		})
	}
	var profile Profile
	if err := c.BodyParser(&profile); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}
	if err := h.service.UpdateProfile(c.Context(), routerID, profileName, &profile); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Profile updated successfully",
	})
}

func (h *Handler) DeleteProfile(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}
	profileName := c.Params("name")
	if profileName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Profile name is required",
		})
	}
	if err := h.service.DeleteProfile(c.Context(), routerID, profileName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Profile deleted successfully",
	})
}

func (h *Handler) GetProfileUsage(c *fiber.Ctx) error {
	routerID, err := strconv.Atoi(c.Params("router_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid router_id",
		})
	}
	usage, err := h.service.GetProfileUsage(c.Context(), routerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       usage,
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

	if err := h.service.SyncSecrets(c.Context(), routerID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "PPPoE secrets synced successfully",
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

	if err := h.service.BlockSecret(c.Context(), id); err != nil {
		status := fiber.StatusInternalServerError
		if errors.Is(err, ErrSecretNotFound) || errors.Is(err, ErrMikrotikItemNotFound) {
			status = fiber.StatusNotFound
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "PPPoE secret blocked successfully",
	})
}

func (h *Handler) Unblock(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid id",
		})
	}

	if err := h.service.UnblockSecret(c.Context(), id); err != nil {
		status := fiber.StatusInternalServerError
		if errors.Is(err, ErrSecretNotFound) || errors.Is(err, ErrMikrotikItemNotFound) {
			status = fiber.StatusNotFound
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "PPPoE secret unblocked successfully",
	})
}
