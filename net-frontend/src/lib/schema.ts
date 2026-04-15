import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(1, "Username atau Email harus diisi"),
  password: z.string().min(1, "Password harus diisi"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// --- Optical device schemas ---

export const oltSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  serial: z.string().optional(),
  ip_address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  vendor: z.enum(["zte", "huawei", "fiberhome", ""]).optional(),
  is_active: z.boolean().default(true),
});
export type OLTFormData = z.infer<typeof oltSchema>;

export const odpSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  serial: z.string().optional(),
  ip_address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  total_ports: z.number().int().positive("Jumlah port harus positif").optional(),
  used_ports: z.number().int().min(0, "Port terpakai tidak boleh negatif").optional(),
  mikrotik_id: z.number().int().optional(),
  technician_id: z.number().int().optional(),
  is_active: z.boolean().default(true),
});
export type ODPFormData = z.infer<typeof odpSchema>;

export const onuSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  serial: z.string().optional(),
  genieacs_id: z.string().optional(),
  odp_id: z.number().optional(),
  ip_address: z.string().optional(),
  vendor: z.enum(["zte", "huawei", "fiberhome", ""]).optional(),
  rx_param_path: z.string().optional(),
  tx_param_path: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  is_active: z.boolean().default(true),
});
export type ONUFormData = z.infer<typeof onuSchema>;

// --- User schemas ---

// Create user schema with confirm password
export const createUserSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  name: z.string().min(3, "Nama minimal 3 karakter"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter"),
  confirmPassword: z.string().min(1, "Konfirmasi password harus diisi"),
  role: z.string().min(1, "Peran harus dipilih"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password dan konfirmasi password tidak cocok",
  path: ["confirmPassword"],
});
export type CreateUserFormData = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter").optional().or(z.literal("")),
  role: z.string().optional(),
});
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;

// --- Finance schemas ---

export const paymentSchema = z.object({
  customer_id: z.number().positive("Pelanggan wajib dipilih"),
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  payment_method: z.enum(["CASH", "TRANSFER", "E-WALLET"]),
  payment_date: z.string().datetime({ message: "Format tanggal tidak valid" }),
  billing_period: z.string().regex(/^\d{4}-\d{2}$/, "Format harus YYYY-MM"),
  note: z.string().max(255, "Catatan maksimal 255 karakter").optional(),
  receipt: z.any().optional().nullable(),
}).superRefine((data, ctx) => {
  if ((data.payment_method === "TRANSFER" || data.payment_method === "E-WALLET") && !data.receipt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receipt"],
      message: "Bukti transfer wajib diunggah untuk metode ini",
    });
  }
});
export type PaymentFormData = z.infer<typeof paymentSchema>;

export const invoiceSchema = z.object({
  customer_id: z.number().positive("Pelanggan wajib dipilih"),
  amount_due: z.number().nonnegative("Jumlah tidak boleh negatif"),
  billing_period: z.string().regex(/^\d{4}-\d{2}$/, "Format harus YYYY-MM"),
  due_date: z.string().datetime({ message: "Format tanggal tidak valid" }),
});
export type InvoiceFormData = z.infer<typeof invoiceSchema>;

// --- Ticket schemas ---

export const ticketSchema = z.object({
  customer_id:  z.number().optional(),
  customer_name: z.string().optional(),
  mikrotik_ref: z.string().optional(),
  onu_id:       z.number().optional(),
  router_id:    z.number().optional(),
  location_odp: z.string().min(1, "Lokasi ODP wajib diisi"),
  category:     z.enum(["INTERNET_DOWN", "LOS", "SLOW", "NO_SIGNAL", "HARDWARE", "BILLING", "OTHER"]),
  priority:     z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title:        z.string().min(5, "Judul minimal 5 karakter").max(255, "Judul maksimal 255 karakter"),
  description:  z.string().min(10, "Deskripsi minimal 10 karakter"),
}).refine((d) => d.customer_id || d.mikrotik_ref, {
  message: "Customer atau PPPoE/ONU ref wajib diisi",
  path: ["customer_id"],
});
export type TicketFormData = z.infer<typeof ticketSchema>;

// --- Package schemas ---

export const createPackageSchema = z.object({
  name: z.string().min(1, "Nama paket wajib diisi"),
  description: z.string().optional(),
  connection_type: z.enum(["PPPOE", "DHCP", "STATIC"] as const, "Tipe koneksi wajib dipilih"),
  router_id: z.number().positive("Router wajib dipilih"),
  mikrotik_profile_name: z.string().min(1, "Nama profil MikroTik wajib diisi"),
});
export type CreatePackageFormData = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z.object({
  name: z.string().min(1, "Nama paket wajib diisi"),
  description: z.string().optional(),
  mikrotik_profile_name: z.string().min(1, "Nama profil MikroTik wajib diisi"),
});
export type UpdatePackageFormData = z.infer<typeof updatePackageSchema>;