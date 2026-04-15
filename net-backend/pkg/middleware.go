package pkg

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	jwtSecretBytes         []byte
	jwtExpirationHours int = 72
)

func SetJWTSecret(secret string) {
	if len(secret) < 64 {
		log.Fatal("JWT_SECRET must be at least 64 characters — refusing to start with a weak secret")
	}
	jwtSecretBytes = []byte(secret)
}

func SetJWTExpirationHours(hours int) {
	jwtExpirationHours = hours
}

func GetJWTExpirationHours() int {
	return jwtExpirationHours
}

func Auth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Missing Authorization header",
			})
		}

		if len(authHeader) <= 7 || authHeader[:7] != "Bearer " {
			return c.Status(fiber.StatusUnauthorized).JSON(Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Invalid token format",
			})
		}

		tokenString := authHeader[7:]

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return jwtSecretBytes, nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Invalid or expired token",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "Invalid token claims",
			})
		}

		c.Locals("user", claims)
		return c.Next()
	}
}

func Role(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole := UserRole(c)
		if userRole == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(Response{
				StatusCode: fiber.StatusUnauthorized,
				Message:    "User not authenticated",
			})
		}

		for _, role := range roles {
			if role == userRole {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(Response{
			StatusCode: fiber.StatusForbidden,
			Message:    "You don't have permission to access this resource",
		})
	}
}

func Can(permission string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return c.Next()
	}
}

func User(c *fiber.Ctx) jwt.MapClaims {
	locals := c.Locals("user")
	if locals == nil {
		return nil
	}
	user, ok := locals.(jwt.MapClaims)
	if !ok {
		return nil
	}
	return user
}

func UserID(c *fiber.Ctx) int {
	claims := User(c)
	if claims != nil {
		if id, ok := claims["id"].(float64); ok {
			return int(id)
		}
	}
	return 0
}

func UserRole(c *fiber.Ctx) string {
	if claims := User(c); claims != nil {
		if role, ok := claims["role"].(string); ok {
			return role
		}
	}
	return ""
}

func UserName(c *fiber.Ctx) string {
	if claims := User(c); claims != nil {
		if name, ok := claims["username"].(string); ok {
			return name
		}
	}
	return ""
}

func IsAuthenticated(c *fiber.Ctx) bool {
	return User(c) != nil
}

func HasRole(c *fiber.Ctx, role string) bool {
	return UserRole(c) == role
}

func HasAnyRole(c *fiber.Ctx, roles ...string) bool {
	userRole := UserRole(c)
	if userRole == "" {
		return false
	}
	for _, role := range roles {
		if role == userRole {
			return true
		}
	}
	return false
}

func GenerateToken(userID int, userRole string) (string, error) {
	claims := jwt.MapClaims{
		"id":   userID,
		"role": userRole,
		"exp":  time.Now().Add(time.Duration(jwtExpirationHours) * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecretBytes)
}

func VerifyPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}
