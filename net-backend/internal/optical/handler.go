package optical

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

const (
	odpPhotoUploadDir = "./uploads/odp"
	odpMaxPhotoSize   = 5 * 1024 * 1024 // 5 MB
)

var allowedPhotoExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
}

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// --- GenieACS ---

func (h *Handler) ListGenieACSDevices(c *fiber.Ctx) error {
	devices, err := h.service.ListGenieACSDevices(c.Context())
	if err != nil {
		// If GenieACS is unreachable, return empty list instead of error
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return c.Status(fiber.StatusOK).JSON(pkg.Response{
				StatusCode: fiber.StatusOK,
				Data:       []interface{}{},
			})
		}
		return c.Status(fiber.StatusBadGateway).JSON(pkg.Response{
			StatusCode: fiber.StatusBadGateway,
			Message:    "Gagal mengambil data dari GenieACS: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       devices,
	})
}

func (h *Handler) GetGenieACSDevice(c *fiber.Ctx) error {
	id := c.Params("*")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID GenieACS diperlukan",
		})
	}
	device, err := h.service.GetGenieACSDevice(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(pkg.Response{
			StatusCode: fiber.StatusBadGateway,
			Message:    "Gagal mengambil perangkat dari GenieACS: " + err.Error(),
		})
	}
	if device == nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Perangkat tidak ditemukan di GenieACS",
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       device,
	})
}

func (h *Handler) GetGenieACSSettings(c *fiber.Ctx) error {
	settings, err := h.service.GetGenieACSSettings(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal memuat pengaturan GenieACS: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       settings,
	})
}

func (h *Handler) UpdateGenieACSSettings(c *fiber.Ctx) error {
	var s GenieACSSettings
	if err := c.BodyParser(&s); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	if s.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "URL GenieACS diperlukan",
		})
	}
	if err := h.service.UpdateGenieACSSettings(c.Context(), s); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal menyimpan pengaturan GenieACS: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Pengaturan GenieACS berhasil disimpan",
	})
}

func (h *Handler) ImportGenieACSDevice(c *fiber.Ctx) error {
	genieacsID := strings.TrimSuffix(c.Params("*"), "/import")
	if genieacsID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID GenieACS diperlukan",
		})
	}

	var body struct {
		DeviceType DeviceType `json:"device_type"`
		Name       string     `json:"name"`
		ODPID      *int       `json:"odp_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Nama perangkat diperlukan",
		})
	}
	if body.DeviceType == "" {
		body.DeviceType = DeviceTypeONU
	}

	raw, err := h.service.GetGenieACSDevice(c.Context(), genieacsID)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(pkg.Response{
			StatusCode: fiber.StatusBadGateway,
			Message:    "Gagal mengambil perangkat dari GenieACS: " + err.Error(),
		})
	}
	if raw == nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Perangkat tidak ditemukan di GenieACS",
		})
	}

	serial := ""
	vendor := ""
	if devID, ok := raw["_deviceId"].(map[string]interface{}); ok {
		if s, ok := devID["_SerialNumber"].(string); ok {
			serial = s
		}
		if m, ok := devID["_Manufacturer"].(string); ok {
			ml := strings.ToLower(m)
			if strings.Contains(ml, "huawei") {
				vendor = "huawei"
			} else if strings.Contains(ml, "zte") {
				vendor = "zte"
			} else if strings.Contains(ml, "fiberhome") || strings.Contains(ml, "fiber home") {
				vendor = "fiberhome"
			}
		}
	}

	d := &Device{
		Name:       body.Name,
		DeviceType: body.DeviceType,
		GenieACSID: genieacsID,
		Serial:     serial,
		Vendor:     vendor,
		ODPID:      body.ODPID,
	}

	created, err := h.service.CreateDevice(c.Context(), d)
	if err != nil {
		if strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key") {
			return c.Status(fiber.StatusConflict).JSON(pkg.Response{
				StatusCode: fiber.StatusConflict,
				Message:    "Perangkat sudah diimport sebelumnya",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       created,
	})
}

// --- OLT ---

func (h *Handler) ListOLT(c *fiber.Ctx) error {
	devices, err := h.service.ListOLT(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       devices,
	})
}

func (h *Handler) CreateOLT(c *fiber.Ctx) error {
	var d Device
	if err := c.BodyParser(&d); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	d.DeviceType = DeviceTypeOLT
	created, err := h.service.CreateDevice(c.Context(), &d)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       created,
	})
}

func (h *Handler) GetDevice(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	device, err := h.service.GetDevice(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	if device == nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Perangkat tidak ditemukan",
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       device,
	})
}

func (h *Handler) UpdateDevice(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	var d Device
	if err := c.BodyParser(&d); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	updated, err := h.service.UpdateDevice(c.Context(), id, &d)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	if updated == nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "Perangkat tidak ditemukan",
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       updated,
	})
}

func (h *Handler) DeleteDevice(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	if err := h.service.DeleteDevice(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Perangkat berhasil dihapus",
	})
}

// --- ODP ---

func (h *Handler) ListODP(c *fiber.Ctx) error {
	summaries, err := h.service.ListODP(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       summaries,
	})
}

func (h *Handler) CreateODP(c *fiber.Ctx) error {
	var d Device
	if err := c.BodyParser(&d); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	d.DeviceType = DeviceTypeODP
	created, err := h.service.CreateDevice(c.Context(), &d)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       created,
	})
}

func (h *Handler) UploadODPPhoto(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}

	fileHeader, err := c.FormFile("photo")
	if err != nil || fileHeader == nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "File foto wajib diunggah (field: photo)",
		})
	}

	if fileHeader.Size > odpMaxPhotoSize {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Ukuran file maksimal 5 MB",
		})
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedPhotoExt[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Format file harus JPG, JPEG, PNG, atau WebP",
		})
	}

	if err := os.MkdirAll(odpPhotoUploadDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal membuat direktori upload",
		})
	}

	filename := fmt.Sprintf("odp_%d_%d%s", id, time.Now().UnixNano(), ext)
	savePath := filepath.Join(odpPhotoUploadDir, filename)
	if err := c.SaveFile(fileHeader, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal menyimpan file",
		})
	}

	photoURL := "/uploads/odp/" + filename
	existing, err := h.service.GetDevice(c.Context(), id)
	if err != nil || existing == nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    "ODP tidak ditemukan",
		})
	}
	existing.PhotoURL = photoURL
	if _, err := h.service.UpdateDevice(c.Context(), id, existing); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal menyimpan URL foto ke database",
		})
	}

	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Foto berhasil diunggah",
		Data:       map[string]string{"photo_url": photoURL},
	})
}

func (h *Handler) AdjustODPPorts(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	var body struct {
		Delta int `json:"delta"`
	}
	if err := c.BodyParser(&body); err != nil || body.Delta == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "delta wajib diisi (bilangan bulat bukan nol)",
		})
	}
	if err := h.service.AdjustODPPorts(c.Context(), id, body.Delta); err != nil {
		status := fiber.StatusInternalServerError
		if strings.Contains(err.Error(), "melebihi kapasitas") || strings.Contains(err.Error(), "tidak ditemukan") {
			status = fiber.StatusBadRequest
		}
		return c.Status(status).JSON(pkg.Response{
			StatusCode: status,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Port ODP berhasil diperbarui",
	})
}

// --- ONU ---

func (h *Handler) ListONU(c *fiber.Ctx) error {
	devices, err := h.service.ListONU(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       devices,
	})
}

func (h *Handler) CreateONU(c *fiber.Ctx) error {
	var d Device
	if err := c.BodyParser(&d); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	d.DeviceType = DeviceTypeONU
	created, err := h.service.CreateDevice(c.Context(), &d)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       created,
	})
}

func (h *Handler) GetStatusHistory(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	statuses, err := h.service.GetStatusHistory(c.Context(), id, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       statuses,
	})
}

// --- Alerts ---

func (h *Handler) ListAlerts(c *fiber.Ctx) error {
	alerts, err := h.service.ListActiveAlerts(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       alerts,
	})
}

func (h *Handler) ResolveAlert(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	if err := h.service.ResolveAlert(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Alert berhasil diselesaikan",
	})
}

// --- Fiber Cables ---

func (h *Handler) ListFiberCables(c *fiber.Ctx) error {
	cables, err := h.service.ListFiberCables(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal mengambil data kabel: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       cables,
	})
}

func (h *Handler) CreateFiberCable(c *fiber.Ctx) error {
	var cable FiberCable
	if err := c.BodyParser(&cable); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	created, err := h.service.CreateFiberCable(c.Context(), &cable)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal membuat kabel: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       created,
	})
}

func (h *Handler) UpdateFiberCable(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	var cable FiberCable
	if err := c.BodyParser(&cable); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Request tidak valid",
		})
	}
	updated, err := h.service.UpdateFiberCable(c.Context(), id, &cable)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal update kabel: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Data:       updated,
	})
}

func (h *Handler) DeleteFiberCable(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "ID tidak valid",
		})
	}
	if err := h.service.DeleteFiberCable(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    "Gagal hapus kabel: " + err.Error(),
		})
	}
	return c.Status(fiber.StatusOK).JSON(pkg.Response{
		StatusCode: fiber.StatusOK,
		Message:    "Kabel berhasil dihapus",
	})
}
