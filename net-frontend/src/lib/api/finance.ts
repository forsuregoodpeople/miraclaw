import { api } from "@/lib/axios";

export interface Payment {
  id: number;
  customer_id: number;
  customer_name: string;
  amount: number;
  payment_method: "CASH" | "TRANSFER" | "E-WALLET";
  payment_date: string;   // ISO 8601
  billing_period: string; // YYYY-MM
  note?: string;
  receipt_path?: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  customer_id: number;
  customer_name: string;
  amount_due: number;
  billing_period: string;
  due_date: string;       // ISO 8601
  status: "UNPAID" | "PAID" | "OVERDUE";
  package_id?: number | null;
  package_name?: string;
  created_at: string;
}

export interface BulkCreateInvoiceItem {
  customer_id: number;
  customer_name: string;
  amount_due: number;
  router_id?: number;
}

export interface BulkCreateInvoiceRequest {
  items: BulkCreateInvoiceItem[];
  billing_period: string;
  due_date: string;
}

export interface BulkCreateInvoiceResult {
  created: number;
  skipped: number;
  errors?: string[];
}

export interface FinanceSummary {
  total_revenue: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  payment_count: number;
  invoice_count: number;
  period: string;
}

export interface CreatePaymentRequest {
  customer_id: number;
  customer_name: string;
  amount: number;
  payment_method: "CASH" | "TRANSFER" | "E-WALLET";
  payment_date: string;
  billing_period: string;
  note?: string;
  receipt?: File | null;
  router_id?: number;
}

export interface CreateInvoiceRequest {
  customer_id: number;
  customer_name: string;
  amount_due: number;
  billing_period: string;
  due_date: string;
  router_id?: number;
}

export interface UpdatePaymentRequest {
  customer_name: string;
  amount: number;
  payment_method: "CASH" | "TRANSFER" | "E-WALLET";
  payment_date: string;
  billing_period: string;
  note?: string;
}

export interface UpdateInvoiceRequest {
  customer_name: string;
  amount_due: number;
  billing_period: string;
  due_date: string;
  status: "UNPAID" | "PAID" | "OVERDUE";
}

export interface Tariff {
  id: number;
  customer_id: number;
  monthly_fee: number;
  updated_at: string;
}

export const FinanceApi = {
  getPayments: async (period?: string): Promise<Payment[]> => {
    const res = await api.get<{ data: Payment[] }>("/v1/finance/payments", {
      params: period ? { period } : {},
    });
    return res.data.data ?? [];
  },

  createPayment: async (data: CreatePaymentRequest): Promise<Payment> => {
    const form = new FormData();
    form.append("customer_id", String(data.customer_id));
    form.append("customer_name", data.customer_name);
    form.append("amount", String(data.amount));
    form.append("payment_method", data.payment_method);
    form.append("payment_date", data.payment_date);
    form.append("billing_period", data.billing_period);
    if (data.note) form.append("note", data.note);
    if (data.receipt) form.append("receipt", data.receipt);
    if (data.router_id) form.append("router_id", String(data.router_id));

    const res = await api.post<{ data: Payment }>("/v1/finance/payments", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
  },

  getInvoices: async (params?: { period?: string; customer_id?: number }): Promise<Invoice[]> => {
    const res = await api.get<{ data: Invoice[] }>("/v1/finance/invoices", { params });
    return res.data.data ?? [];
  },

  createInvoice: async (data: CreateInvoiceRequest): Promise<Invoice> => {
    const res = await api.post<{ data: Invoice }>("/v1/finance/invoices", data);
    return res.data.data;
  },

  deletePayment: async (id: number): Promise<void> => {
    await api.delete(`/v1/finance/payments/${id}`);
  },

  updatePayment: async (id: number, data: UpdatePaymentRequest): Promise<Payment> => {
    const res = await api.put<{ data: Payment }>(`/v1/finance/payments/${id}`, data);
    return res.data.data;
  },

  updateInvoice: async (id: number, data: UpdateInvoiceRequest): Promise<Invoice> => {
    const res = await api.put<{ data: Invoice }>(`/v1/finance/invoices/${id}`, data);
    return res.data.data;
  },

  createBulkInvoices: async (data: BulkCreateInvoiceRequest): Promise<BulkCreateInvoiceResult> => {
    const res = await api.post<{ data: BulkCreateInvoiceResult }>("/v1/finance/invoices/bulk", data);
    return res.data.data;
  },

  getSummary: async (period: string): Promise<FinanceSummary> => {
    const res = await api.get<{ data: FinanceSummary }>("/v1/finance/summary", {
      params: { period },
    });
    return res.data.data;
  },

  getTariff: async (customerId: number): Promise<Tariff | null> => {
    const res = await api.get<{ data: Tariff }>("/v1/finance/tariff", {
      params: { customer_id: customerId },
    });
    return res.data.data ?? null;
  },

  upsertTariff: async (customerId: number, monthlyFee: number): Promise<Tariff> => {
    const res = await api.put<{ data: Tariff }>("/v1/finance/tariff", {
      customer_id: customerId,
      monthly_fee: monthlyFee,
    });
    return res.data.data;
  },
};
