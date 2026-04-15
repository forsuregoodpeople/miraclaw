package finance

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/net-backend/pkg"
)

const (
	uploadDir      = "./uploads/receipts"
	maxReceiptSize = 5 << 20 // 5 MB
)

var allowedReceiptExt = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
}

type Handler struct {
	service IFinanceService
}

func NewHandler(service IFinanceService) *Handler {
	return &Handler{service: service}
}

// GET /v1/finance/payments?period=YYYY-MM
func (h *Handler) GetPayments(c *fiber.Ctx) error {
	period := c.Query("period")
	payments, err := h.service.GetPayments(c.Context(), period)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: payments})
}

// POST /v1/finance/payments — accepts multipart/form-data
func (h *Handler) CreatePayment(c *fiber.Ctx) error {
	// Parse text fields from multipart form
	amountStr := c.FormValue("amount")
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil || amount <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "amount harus berupa angka lebih dari 0",
		})
	}

	customerID, _ := strconv.Atoi(c.FormValue("customer_id"))
	routerID, _ := strconv.Atoi(c.FormValue("router_id"))
	req := CreatePaymentRequest{
		CustomerID:    customerID,
		CustomerName:  c.FormValue("customer_name"),
		Amount:        amount,
		PaymentMethod: c.FormValue("payment_method"),
		PaymentDate:   c.FormValue("payment_date"),
		BillingPeriod: c.FormValue("billing_period"),
		Note:          c.FormValue("note"),
		RouterID:      routerID,
	}

	if req.CustomerID == 0 || req.PaymentMethod == "" || req.BillingPeriod == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "customer_id, payment_method, dan billing_period wajib diisi",
		})
	}

	// Receipt is required for TRANSFER and E-WALLET
	needsReceipt := req.PaymentMethod == "TRANSFER" || req.PaymentMethod == "E-WALLET"
	fileHeader, fileErr := c.FormFile("receipt")

	if needsReceipt && (fileErr != nil || fileHeader == nil) {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Bukti transfer wajib diunggah untuk metode Transfer Bank atau E-Wallet",
		})
	}

	if fileHeader != nil {
		// Validate size
		if fileHeader.Size > maxReceiptSize {
			return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
				StatusCode: fiber.StatusBadRequest,
				Message:    "Ukuran file maksimal 5 MB",
			})
		}

		// Validate extension
		ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
		if !allowedReceiptExt[ext] {
			return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
				StatusCode: fiber.StatusBadRequest,
				Message:    "Format file harus JPG, JPEG, PNG, atau WebP",
			})
		}

		// Save file
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
				StatusCode: fiber.StatusInternalServerError,
				Message:    "Gagal menyimpan file",
			})
		}

		filename := fmt.Sprintf("%d_%d%s",
			time.Now().UnixNano(),
			req.CustomerID,
			ext,
		)
		savePath := filepath.Join(uploadDir, filename)

		if err := c.SaveFile(fileHeader, savePath); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
				StatusCode: fiber.StatusInternalServerError,
				Message:    "Gagal menyimpan file",
			})
		}

		req.ReceiptPath = "/uploads/receipts/" + filename
	}

	payment, err := h.service.CreatePayment(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       payment,
	})
}

// DELETE /v1/finance/payments/:id
func (h *Handler) DeletePayment(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "invalid payment id",
		})
	}
	if err := h.service.DeletePayment(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "payment deleted"})
}

// PUT /v1/finance/payments/:id
func (h *Handler) UpdatePayment(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid payment id"})
	}
	var req UpdatePaymentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	if req.Amount <= 0 || req.PaymentMethod == "" || req.BillingPeriod == "" || req.PaymentDate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "amount, payment_method, billing_period, dan payment_date wajib diisi"})
	}
	updated, err := h.service.UpdatePayment(c.Context(), id, req)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: updated})
}

// DELETE /v1/finance/invoices/:id
func (h *Handler) DeleteInvoice(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "invalid invoice id",
		})
	}
	if err := h.service.DeleteInvoice(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "invoice deleted"})
}

// PUT /v1/finance/invoices/:id
func (h *Handler) UpdateInvoice(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid invoice id"})
	}
	var req UpdateInvoiceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "invalid request body"})
	}
	if req.AmountDue <= 0 || req.BillingPeriod == "" || req.DueDate == "" || req.Status == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{StatusCode: fiber.StatusBadRequest, Message: "amount_due, billing_period, due_date, dan status wajib diisi"})
	}
	updated, err := h.service.UpdateInvoice(c.Context(), id, req)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{StatusCode: fiber.StatusNotFound, Message: err.Error()})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: updated})
}

// GET /v1/finance/invoices?period=YYYY-MM&customer_id=5
func (h *Handler) GetInvoices(c *fiber.Ctx) error {
	period := c.Query("period")
	customerID, _ := strconv.Atoi(c.Query("customer_id"))
	invoices, err := h.service.GetInvoices(c.Context(), period, customerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: invoices})
}

// POST /v1/finance/invoices
func (h *Handler) CreateInvoice(c *fiber.Ctx) error {
	var req CreateInvoiceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}

	if req.CustomerID == 0 || req.BillingPeriod == "" || req.DueDate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "customer_id, billing_period, and due_date are required",
		})
	}

	invoice, err := h.service.CreateInvoice(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       invoice,
	})
}

// POST /v1/finance/invoices/bulk
func (h *Handler) CreateBulkInvoices(c *fiber.Ctx) error {
	var req BulkCreateInvoiceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "invalid request body",
		})
	}
	if req.BillingPeriod == "" || req.DueDate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "billing_period and due_date are required",
		})
	}
	result, err := h.service.CreateBulkInvoices(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(pkg.Response{
		StatusCode: fiber.StatusCreated,
		Data:       result,
	})
}

// PUT /v1/finance/invoices/:id/paid
func (h *Handler) MarkInvoicePaid(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid invoice ID",
		})
	}

	if err := h.service.MarkInvoicePaid(c.Context(), id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(pkg.Response{
			StatusCode: fiber.StatusNotFound,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Message: "Invoice marked as paid"})
}

// GET /v1/finance/summary?period=YYYY-MM
func (h *Handler) GetSummary(c *fiber.Ctx) error {
	period := c.Query("period")
	summary, err := h.service.GetSummary(c.Context(), period)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: summary})
}

// GET /v1/finance/tariff?customer_id=5
func (h *Handler) GetTariff(c *fiber.Ctx) error {
	customerID, err := strconv.Atoi(c.Query("customer_id"))
	if err != nil || customerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "customer_id wajib diisi",
		})
	}
	tariff, err := h.service.GetTariff(c.Context(), customerID)
	if err != nil {
		// Return zero tariff when not found rather than 404
		return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: map[string]any{
			"customer_id": customerID,
			"monthly_fee": 0,
		}})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: tariff})
}

// PUT /v1/finance/tariff
func (h *Handler) UpsertTariff(c *fiber.Ctx) error {
	var req UpsertTariffRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "Invalid request body",
		})
	}
	if req.CustomerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(pkg.Response{
			StatusCode: fiber.StatusBadRequest,
			Message:    "customer_id wajib diisi",
		})
	}
	tariff, err := h.service.UpsertTariff(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(pkg.Response{
			StatusCode: fiber.StatusInternalServerError,
			Message:    err.Error(),
		})
	}
	return c.JSON(pkg.Response{StatusCode: fiber.StatusOK, Data: tariff})
}

// sanitizeFilename removes characters unsafe for filenames.
func sanitizeFilename(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	result := b.String()
	if len(result) > 32 {
		result = result[:32]
	}
	if result == "" {
		result = "receipt"
	}
	return result
}
