package session

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/net-backend/pkg"
	"github.com/net-backend/pkg/logger"
	"github.com/sirupsen/logrus"
)

type Middleware struct {
	session *Session
}

func NewMiddleware(session *Session) *Middleware {
	return &Middleware{session: session}
}

func (m *Middleware) Auth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID := c.Cookies(m.session.GetCookieName())

		if sessionID == "" {
			sessionID = c.Query("session_id")
		}

		if sessionID == "" {
			logger.Log.WithFields(logrus.Fields{
				"event":  "auth_check",
				"reason": "missing_session",
				"path":   c.Path(),
			}).Warn("Authentication failed - missing session")

			if websocket.IsWebSocketUpgrade(c) {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Missing session cookie",
				})
			}
			return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Missing session cookie",
			})
		}

		logger.Log.WithFields(logrus.Fields{
			"event":      "auth_check",
			"session_id": sessionID,
			"path":       c.Path(),
		}).Debug("Auth check for session")

		sessionData, err := m.session.Get(context.Background(), sessionID)
		if err != nil {
			logger.Log.WithFields(logrus.Fields{
				"event":      "auth_check",
				"reason":     "invalid_session",
				"session_id": sessionID,
				"path":       c.Path(),
			}).WithError(err).Warn("Authentication failed - invalid or expired session")

			if websocket.IsWebSocketUpgrade(c) {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Invalid or expired session",
				})
			}
			return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Invalid or expired session",
			})
		}

		expiration := pkg.GetJWTExpirationHours()

		claims := jwt.MapClaims{
			"id":       float64(sessionData.UserID),
			"username": sessionData.Username,
			"email":    sessionData.Email,
			"role":     sessionData.Role,
			"exp":      time.Now().Add(time.Duration(expiration) * time.Hour).Unix(),
		}

		c.Locals("user", claims)
		logger.Log.WithFields(logrus.Fields{
			"event":    "auth_check",
			"result":   "passed",
			"username": sessionData.Username,
			"user_id":  sessionData.UserID,
		}).Info("Authentication passed")
		return c.Next()
	}
}

func (m *Middleware) Role(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole := pkg.UserRole(c)
		if userRole == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(pkg.Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "User not authenticated",
			})
		}

		for _, role := range roles {
			if role == userRole {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(pkg.Response{
			StatusCode: fiber.StatusForbidden,
			Message:    "You don't have permission to access this resource",
		})
	}
}
