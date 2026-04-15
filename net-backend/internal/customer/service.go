package customer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/internal/mikrotik/pelanggan"
	"golang.org/x/crypto/bcrypt"
)

type ICustomerService interface {
	GetAll(ctx context.Context, routerID *int, search string, activeOnly bool) ([]Customer, error)
	GetByID(ctx context.Context, id int) (*Customer, error)
	Create(ctx context.Context, req CreateCustomerRequest) (*Customer, error)
	Update(ctx context.Context, id int, req UpdateCustomerRequest) (*Customer, error)
	Delete(ctx context.Context, id int) error
	BulkImport(ctx context.Context, req ImportCustomersRequest) (ImportResult, error)
	Sync(ctx context.Context, routerID int) (SyncResult, error)
	UpdateCoordinates(ctx context.Context, id int, lat, lng *float64) (*Customer, error)
	UploadPhoto(c *fiber.Ctx, customerID int) (string, error)
}

type service struct {
	repo             ICustomerRepository
	pelangganService pelanggan.Service
}

func NewService(repo ICustomerRepository, pelangganSvc pelanggan.Service) ICustomerService {
	return &service{repo: repo, pelangganService: pelangganSvc}
}

func (s *service) GetAll(ctx context.Context, routerID *int, search string, activeOnly bool) ([]Customer, error) {
	return s.repo.GetAll(ctx, routerID, search, activeOnly)
}

func (s *service) GetByID(ctx context.Context, id int) (*Customer, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) Create(ctx context.Context, req CreateCustomerRequest) (*Customer, error) {
	return s.repo.Create(ctx, req)
}

func (s *service) Update(ctx context.Context, id int, req UpdateCustomerRequest) (*Customer, error) {
	var passwordHash string
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		passwordHash = string(hash)
	}
	return s.repo.Update(ctx, id, req, passwordHash)
}

func (s *service) Delete(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

func (s *service) BulkImport(ctx context.Context, req ImportCustomersRequest) (ImportResult, error) {
	created, skipped, err := s.repo.BulkImport(ctx, req.RouterID, req.Customers)
	return ImportResult{Created: created, Skipped: skipped}, err
}

func (s *service) UpdateCoordinates(ctx context.Context, id int, lat, lng *float64) (*Customer, error) {
	return s.repo.UpdateCoordinates(ctx, id, lat, lng)
}

func (s *service) Sync(ctx context.Context, routerID int) (SyncResult, error) {
	list, err := s.pelangganService.GetAll(ctx, routerID)
	if err != nil {
		return SyncResult{}, fmt.Errorf("sync fetch pelanggan: %w", err)
	}

	rows := make([]ImportRow, 0, len(list))
	refs := make([]string, 0, len(list))
	for _, p := range list {
		hasComment := p.Comment != ""
		name := p.Comment
		if name == "" {
			name = p.Name
		}
		rows = append(rows, ImportRow{
			Name:        name,
			Type:        p.Type,
			MikrotikRef: p.ID,
			Profile:     p.Profile,
			HasComment:  hasComment,
		})
		refs = append(refs, p.ID)
	}

	created, updated, err := s.repo.BulkUpsert(ctx, routerID, rows)
	if err != nil {
		return SyncResult{}, err
	}

	deactivated, err := s.repo.DeactivateMissing(ctx, routerID, refs)
	if err != nil {
		return SyncResult{}, err
	}

	return SyncResult{Created: created, Updated: updated, Total: len(rows), Deactivated: deactivated}, nil
}

// UploadPhoto handles multipart file upload, validates, saves, and updates photo_url.
func (s *service) UploadPhoto(c *fiber.Ctx, customerID int) (string, error) {
	file, err := c.FormFile("photo")
	if err != nil {
		return "", fmt.Errorf("field 'photo' tidak ditemukan")
	}

	const maxSize = 2 * 1024 * 1024 // 2 MB
	if file.Size > maxSize {
		return "", fmt.Errorf("ukuran file maksimal 2MB")
	}

	ext := filepath.Ext(file.Filename)
	switch ext {
	case ".jpg", ".jpeg", ".png":
	default:
		return "", fmt.Errorf("format hanya JPG/PNG yang diizinkan")
	}

	filename := fmt.Sprintf("uploads/customers/%d%s", customerID, ext)
	if err := os.MkdirAll("uploads/customers", 0755); err != nil {
		return "", fmt.Errorf("gagal membuat direktori: %w", err)
	}
	if err := c.SaveFile(file, filename); err != nil {
		return "", fmt.Errorf("gagal menyimpan foto: %w", err)
	}

	photoURL := "/" + filename
	if err := s.repo.UpdatePhotoURL(c.Context(), customerID, photoURL); err != nil {
		return "", fmt.Errorf("gagal update photo_url: %w", err)
	}
	return photoURL, nil
}
