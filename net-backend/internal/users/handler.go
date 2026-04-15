package users

import (
	"os"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/session"
	"github.com/net-backend/pkg"
	"github.com/net-backend/pkg/logger"
	"github.com/net-backend/pkg/validation"
	"github.com/sirupsen/logrus"
)

type UserHandler struct {
	service IUserService
	session session.ISession
}

func NewUserHandler(service IUserService, session session.ISession) *UserHandler {
	return &UserHandler{service: service, session: session}
}

func (h *UserHandler) CreateUser(c *fiber.Ctx) error {
	actingUserID := pkg.UserID(c)
	actingUserRole := pkg.UserRole(c)
	if actingUserID == 0 || actingUserRole == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "User not authenticated",
		})
	}

	actingUser := Users{ID: actingUserID, Role: actingUserRole}

	var user Users
	if err := c.BodyParser(&user); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	validationErrors := user.Validate()
	if len(validationErrors) > 0 {
		return pkg.NewErrorValidation(c, validationErrors)
	}

	passwordValidationErr := validation.ValidatePassword(user.Password)
	if passwordValidationErr != nil {
		logger.Log.WithFields(logrus.Fields{
			"event":    "user_create_failed",
			"username": user.Username,
			"reason":   "password_complexity",
		}).Info("Password validation failed")

		validationErrors = append(validationErrors, pkg.ValidationError{
			Field:   "password",
			Message: passwordValidationErr.Error(),
		})

		return pkg.NewErrorValidation(c, validationErrors)
	}

	createdUser, err := h.service.Create(c.Context(), &user, actingUser)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       createdUser,
	})
}

func (h *UserHandler) Login(c *fiber.Ctx) error {
	var input LoginInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	logger.Log.WithField("event", "login_attempt").WithField("username", input.Username).Info("User login attempt")

	user, _, err := h.service.Login(c.Context(), &input)

	if err != nil {
		logger.Log.WithField("event", "login_failed").WithField("username", input.Username).WithError(err).Error("Login failed")
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "Invalid username or password",
		})
	}

	sessionID, err := h.session.Create(c.Context(), session.SessionData{
		UserID:   user.ID,
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
	})

	if err != nil {
		logger.Log.WithField("username", user.Username).WithError(err).Error("Failed to create session")
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Failed to create session",
		})
	}

	logger.Log.WithFields(logrus.Fields{
		"event":      "session_created",
		"username":   user.Username,
		"session_id": sessionID,
	}).Info("Session created")

	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	cookieSecure := os.Getenv("APP_ENV") == "production"
	c.Cookie(&fiber.Cookie{
		Name:     h.session.GetCookieName(),
		Value:    sessionID,
		HTTPOnly: true,
		Secure:   cookieSecure,
		SameSite: "Strict",
		Path:     "/",
		Domain:   cookieDomain,
		MaxAge:   h.session.GetExpiration(),
	})

	logger.Log.WithFields(logrus.Fields{
		"event":    "cookie_set",
		"username": user.Username,
	}).Info("Cookie set")

	user.Password = ""

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Login successful",
		Data: fiber.Map{
			"user":       user,
			"session_id": sessionID,
		},
	})
}

func (h *UserHandler) Logout(c *fiber.Ctx) error {
	sessionID := c.Cookies(h.session.GetCookieName())
	if sessionID != "" {
		_ = h.session.Delete(c.Context(), sessionID)
	}

	c.ClearCookie(h.session.GetCookieName())

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Logout successful",
	})
}

func (h *UserHandler) FindAll(c *fiber.Ctx) error {
	actingUser := Users{ID: pkg.UserID(c), Role: pkg.UserRole(c)}
	users, err := h.service.FindAll(c.Context(), actingUser)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       users,
	})
}

func (h *UserHandler) FindById(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid ID",
		})
	}

	user, err := h.service.FindById(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       user,
	})
}

func (h *UserHandler) GetProfile(c *fiber.Ctx) error {
	userID := pkg.UserID(c)
	if userID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "User not authenticated",
		})
	}

	user, err := h.service.FindById(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}

	user.Password = ""

	// Get session_id from cookie to include in response for WebSocket connections
	sessionID := c.Cookies(h.session.GetCookieName())

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data: fiber.Map{
			"user":       user,
			"session_id": sessionID,
		},
	})
}

func (h *UserHandler) UpdateUser(c *fiber.Ctx) error {
	actingUserID := pkg.UserID(c)
	actingUserRole := pkg.UserRole(c)
	if actingUserID == 0 || actingUserRole == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "User not authenticated",
		})
	}

	targetID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid ID",
		})
	}

	targetUser, err := h.service.FindById(c.Context(), targetID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "User not found",
		})
	}

	switch actingUserRole {
	case RoleSuperAdmin:
		// superadmin can update anyone
	case RoleMitra:
		if targetUser.ParentID == nil || *targetUser.ParentID != actingUserID {
			return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
				StatusCode: fiber.StatusForbidden,
				Message:    "Access denied",
			})
		}
		if targetUser.Role != RoleAdmin && targetUser.Role != RoleTeknisi {
			return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
				StatusCode: fiber.StatusForbidden,
				Message:    "Access denied",
			})
		}
	default:
		return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
			StatusCode: fiber.StatusForbidden,
			Message:    "Access denied",
		})
	}

	var updateData Users
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	// Guard: mitra cannot escalate roles
	if actingUserRole == RoleMitra {
		if updateData.Role == RoleSuperAdmin || updateData.Role == RoleMitra {
			return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
				StatusCode: fiber.StatusForbidden,
				Message:    "Cannot assign this role",
			})
		}
	}

	updateData.ID = targetID
	if updateData.Name == "" {
		updateData.Name = targetUser.Name
	}
	if updateData.Email == "" {
		updateData.Email = targetUser.Email
	}
	if updateData.Role == "" {
		updateData.Role = targetUser.Role
	}

	err = h.service.Update(c.Context(), &updateData)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "User updated successfully",
	})
}

func (h *UserHandler) DeleteUser(c *fiber.Ctx) error {
	actingUserID := pkg.UserID(c)
	actingUserRole := pkg.UserRole(c)
	if actingUserID == 0 || actingUserRole == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "User not authenticated",
		})
	}

	targetID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid ID",
		})
	}

	if actingUserID == targetID {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Cannot delete your own account",
		})
	}

	targetUser, err := h.service.FindById(c.Context(), targetID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "User not found",
		})
	}

	switch actingUserRole {
	case RoleSuperAdmin:
		if targetUser.Role == RoleSuperAdmin {
			return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
				StatusCode: fiber.StatusForbidden,
				Message:    "Cannot delete another superadmin",
			})
		}
	case RoleMitra:
		if targetUser.ParentID == nil || *targetUser.ParentID != actingUserID {
			return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
				StatusCode: fiber.StatusForbidden,
				Message:    "Access denied",
			})
		}
	default:
		return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
			StatusCode: fiber.StatusForbidden,
			Message:    "Access denied",
		})
	}

	err = h.service.Delete(c.Context(), targetID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "User deleted successfully",
	})
}

func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	userID := pkg.UserID(c)
	if userID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
			StatusCode: fiber.StatusUnauthorized,
			Message:    "User not authenticated",
		})
	}

	var updateData Users
	if err := c.BodyParser(&updateData); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	updateData.ID = userID

	existingUser, err := h.service.FindById(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "User not found",
		})
	}

	if updateData.Name == "" {
		updateData.Name = existingUser.Name
	}
	if updateData.Email == "" {
		updateData.Email = existingUser.Email
	}

	err = h.service.Update(c.Context(), &updateData)
	if err != nil {
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
