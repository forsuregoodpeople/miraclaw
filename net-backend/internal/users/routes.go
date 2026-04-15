package users

import (
	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/session"
)

func RegisterRoutes(app *fiber.App, handler *UserHandler, sessionMiddleware *session.Middleware) {
	v1 := app.Group("v1")

	v1.Post("/login", handler.Login)
	v1.Post("/logout", sessionMiddleware.Auth(), handler.Logout)
	v1.Get("/profile", sessionMiddleware.Auth(), handler.GetProfile)
	v1.Put("/profile", sessionMiddleware.Auth(), handler.UpdateProfile)

	userGroup := v1.Group("/users")
	userGroup.Use(sessionMiddleware.Auth())

	userGroup.Post("/", handler.CreateUser)
	userGroup.Get("/", sessionMiddleware.Role(RoleSuperAdmin, RoleAdmin, RoleMitra), handler.FindAll)
	userGroup.Get("/:id", sessionMiddleware.Role(RoleSuperAdmin, RoleAdmin, RoleMitra), handler.FindById)
	userGroup.Put("/:id", sessionMiddleware.Role(RoleSuperAdmin, RoleMitra), handler.UpdateUser)
	userGroup.Delete("/:id", sessionMiddleware.Role(RoleSuperAdmin, RoleMitra), handler.DeleteUser)
}
