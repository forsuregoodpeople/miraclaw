package mikrotik

import (
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/net-backend/pkg"
)

type Router struct {
	ID        int        `json:"id"`
	Name      string     `json:"name" validate:"required"`
	Host      string     `json:"host" validate:"required,hostname|ip"`
	Port      int        `json:"port" validate:"required,min=1,max=65535"`
	Username  string     `json:"username" validate:"required"`
	Password  string     `json:"password" validate:"required"`
	MitraID   int        `json:"mitra_id"`
	Status    string     `json:"status"`
	IsActive  bool       `json:"is_active"`
	Latitude  *float64   `json:"latitude,omitempty"`
	Longitude *float64   `json:"longitude,omitempty"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

func (r *Router) Validate() []pkg.ValidationError {
	validate := validator.New()
	return pkg.ParseValidate(validate.Struct(r))
}

type RouterUpdate struct {
	ID        int      `json:"id"`
	Name      string   `json:"name" validate:"required"`
	Host      string   `json:"host" validate:"required,hostname|ip"`
	Port      int      `json:"port" validate:"required,min=1,max=65535"`
	Username  string   `json:"username" validate:"required"`
	Password  string   `json:"password"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
}

func (r *RouterUpdate) Validate() []pkg.ValidationError {
	validate := validator.New()
	return pkg.ParseValidate(validate.Struct(r))
}
