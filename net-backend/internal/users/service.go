package users

import (
	"context"

	"github.com/net-backend/pkg"
	"golang.org/x/crypto/bcrypt"
)

type IUserService interface {
	FindAll(ctx context.Context, actingUser Users) ([]Users, error)
	FindById(ctx context.Context, id int) (*Users, error)
	Login(ctx context.Context, input *LoginInput) (*Users, *string, error)
	Create(ctx context.Context, userReq *Users, actingUser Users) (*Users, error)
	Update(ctx context.Context, userReq *Users) error
	Delete(ctx context.Context, id int) error
}

type UserService struct {
	repo IUserRepository
}

func NewUserService(repo IUserRepository) *UserService {
	return &UserService{
		repo: repo,
	}
}

type LoginInput struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

func (s *UserService) FindAll(ctx context.Context, actingUser Users) ([]Users, error) {
	switch actingUser.Role {
	case RoleMitra:
		// Mitra sees only their own children
		children, err := s.repo.FindByParentID(ctx, actingUser.ID)
		if err != nil {
			return nil, err
		}
		// Include mitra themselves
		self, err := s.repo.FindById(ctx, actingUser.ID)
		if err != nil {
			return nil, err
		}
		self.Password = ""
		return append([]Users{*self}, children...), nil
	default:
		// superadmin and admin see all
		return s.repo.FindAll(ctx)
	}
}

func (s *UserService) FindById(ctx context.Context, id int) (*Users, error) {
	return s.repo.FindById(ctx, id)
}

func (s *UserService) Create(ctx context.Context, userReq *Users, actingUser Users) (*Users, error) {
	if actingUser.Role == RoleSuperAdmin {
		if userReq.Role != RoleMitra && userReq.Role != RoleSuperAdmin {
			return nil, pkg.NewError("SuperAdmin can only create Mitra or SuperAdmin users")
		}
	} else if actingUser.Role == RoleMitra {
		if userReq.Role != RoleAdmin && userReq.Role != RoleTeknisi {
			return nil, pkg.NewError("Mitra can only create Admin or Teknisi")
		}
		// Force ParentID to be the Mitra's ID
		userReq.ParentID = &actingUser.ID
	} else {
		return nil, pkg.NewError("You don't have permission to create users")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), 12)
	if err != nil {
		return nil, err
	}
	userReq.Password = string(hashedPassword)

	err = s.repo.Create(ctx, userReq)
	if err != nil {
		return nil, err
	}

	return userReq, nil
}

func (s *UserService) Update(ctx context.Context, userReq *Users) error {
	return s.repo.Update(ctx, userReq)
}

func (s *UserService) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

func (s *UserService) Login(ctx context.Context, input *LoginInput) (*Users, *string, error) {
	user, err := s.repo.FindByUsernameOrEmail(ctx, input.Username, input.Username)
	if err != nil {
		return nil, nil, pkg.NewError("Invalid username or password")
	}

	if user == nil {
		return nil, nil, pkg.NewError("Invalid username or password")
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		return nil, nil, pkg.NewError("Invalid username or password")
	}

	token, err := pkg.GenerateToken(user.ID, user.Role)
	if err != nil {
		return nil, nil, err
	}

	return user, &token, nil
}
