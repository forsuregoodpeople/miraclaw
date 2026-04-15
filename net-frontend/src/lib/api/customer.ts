import { api } from "@/lib/axios";

export interface Customer {
  id: number;
  name: string;
  type: "PPPOE" | "DHCP" | "STATIC";
  router_id: number | null;
  mikrotik_ref: string;
  wa_number?: string;
  photo_url?: string;
  address?: string;
  note?: string;
  is_active: boolean;
  package_id?: number | null;
  package_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerRequest {
  name: string;
  type: "PPPOE" | "DHCP" | "STATIC";
  router_id?: number | null;
  mikrotik_ref?: string;
  email?: string;
  wa_number?: string;
  address?: string;
  note?: string;
  package_id?: number | null;
}

export interface UpdateCustomerRequest {
  name: string;
  type: "PPPOE" | "DHCP" | "STATIC";
  email?: string;
  password?: string;
  wa_number?: string;
  address?: string;
  note?: string;
}

export interface ImportRow {
  name: string;
  type: "PPPOE" | "DHCP" | "STATIC";
  mikrotik_ref: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
}

export interface SyncResult {
  created: number;
  updated: number;
  total: number;
  deactivated: number;
}

export const CustomerApi = {
  getAll: async (params?: { router_id?: number; search?: string; active?: boolean }): Promise<Customer[]> => {
    const res = await api.get<{ data: Customer[] }>("/v1/customers/", { params });
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<Customer> => {
    const res = await api.get<{ data: Customer }>(`/v1/customers/${id}`);
    return res.data.data;
  },

  create: async (data: CreateCustomerRequest): Promise<Customer> => {
    const res = await api.post<{ data: Customer }>("/v1/customers/", data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateCustomerRequest): Promise<Customer> => {
    const res = await api.put<{ data: Customer }>(`/v1/customers/${id}`, data);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/v1/customers/${id}`);
  },

  import: async (routerId: number, rows: ImportRow[]): Promise<ImportResult> => {
    const res = await api.post<{ data: ImportResult }>("/v1/customers/import", {
      router_id: routerId,
      customers: rows,
    });
    return res.data.data;
  },

  sync: async (routerId: number): Promise<SyncResult> => {
    const res = await api.post<{ data: SyncResult }>(`/v1/customers/sync/${routerId}`, null, { timeout: 120_000 });
    return res.data.data;
  },

  updateCoordinates: async (id: number, latitude: number | null, longitude: number | null): Promise<Customer> => {
    const res = await api.patch<{ data: Customer }>(`/v1/customers/${id}/coordinates`, { latitude, longitude });
    return res.data.data;
  },
  
  uploadPhoto: async (id: number, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("photo", file);
    const res = await api.post<{ data: { photo_url: string } }>(`/v1/customers/${id}/photo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data.photo_url;
  },
};
