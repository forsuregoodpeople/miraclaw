package users

import (
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/net-backend/pkg"
)

type Users struct {
	ID        int        `json:"id"`
	Username  string     `form:"username" json:"username" validate:"required,min=3"`
	Name      string     `form:"name" json:"name" validate:"required,min=3"`
	Email     string     `form:"email" json:"email" validate:"omitempty,email"`
	Password  string     `form:"password" json:"password" validate:"required,min=8"`
	Role      string     `form:"role" json:"role" validate:"omitempty,oneof=superadmin mitra teknisi admin"`
	ParentID  *int       `json:"parent_id" validate:"omitempty,gt=0"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

const (
	RoleSuperAdmin = "superadmin"
	RoleMitra      = "mitra"
	RoleTeknisi    = "teknisi"
	RoleAdmin      = "admin"
)

func (r *Users) Validate() []pkg.ValidationError {
	validate := validator.New()

	return pkg.ParseValidate(validate.Struct(r))
}
