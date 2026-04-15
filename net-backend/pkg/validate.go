package pkg

import (
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
)

func NewErrorValidation(c *fiber.Ctx, errors []ValidationError) error {
	return c.Status(fiber.StatusBadRequest).JSON(Response{
		StatusCode: 409,
		Message:    fiber.ErrBadRequest.Message,
		Data:       errors,
	})
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func ParseValidate(err error) []ValidationError {
	validated, _ := err.(validator.ValidationErrors)

	var errors []ValidationError
	for _, e := range validated {
		var message string

		// => Registered Custom Validation At Here
		switch e.Tag() {
		case "required":
			message = "field is required"
		case "min":
			message = "minimum value is " + e.Param()
		case "max":
			message = "maximum value is " + e.Param()
		case "hostname":
			message = "must be a valid hostname"
		case "ip":
			message = "must be a valid IP address"
		default:
			message = "field " + strings.ToLower(e.Field()) + " " + e.Tag()
		}

		errors = append(errors, ValidationError{
			Field:   strings.ToLower(e.Field()),
			Message: message,
		})
	}

	return errors
}
