import { api } from "@/lib/axios";

export interface Package {
  id: number;
  name: string;
  description?: string;
  connection_type: "PPPOE" | "DHCP" | "STATIC";
  router_id: number;
  mikrotik_profile_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // populated by GetAll via LATERAL join
  last_sync_status?: "ok" | "mismatch" | "missing" | "";
  last_checked_at?: string | null;
  mikrotik_actual?: string;
}

export interface CreatePackageRequest {
  name: string;
  description?: string;
  connection_type: "PPPOE" | "DHCP" | "STATIC";
  router_id: number;
  mikrotik_profile_name: string;
}

export interface UpdatePackageRequest {
  name: string;
  description?: string;
  mikrotik_profile_name: string;
}

export interface SyncLog {
  id: number;
  package_id: number;
  checked_at: string;
  status: "ok" | "mismatch" | "missing";
  mikrotik_actual?: string;
  stored_value?: string;
}

export interface SyncCheckResult {
  total: number;
  ok: number;
  mismatch: number;
  missing: number;
}

export interface ProfileSyncResult {
  router_id: number;
  created: number;
  updated: number;
  inactive: number;
  total: number;
  synced_at: string;
}

export const PackageApi = {
  getAll: async (params?: { router_id?: number; type?: string }): Promise<Package[]> => {
    const res = await api.get<{ data: Package[] }>("/v1/packages/", { params });
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<Package> => {
    const res = await api.get<{ data: Package }>(`/v1/packages/${id}`);
    return res.data.data;
  },

  create: async (data: CreatePackageRequest): Promise<Package> => {
    const res = await api.post<{ data: Package }>("/v1/packages/", data);
    return res.data.data;
  },

  update: async (id: number, data: UpdatePackageRequest): Promise<Package> => {
    const res = await api.put<{ data: Package }>(`/v1/packages/${id}`, data);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/v1/packages/${id}`);
  },

  assign: async (packageId: number, customerId: number): Promise<void> => {
    await api.post(`/v1/packages/${packageId}/assign/${customerId}`);
  },

  unassign: async (customerId: number): Promise<void> => {
    await api.delete(`/v1/packages/unassign/${customerId}`);
  },

  sync: async (routerId: number): Promise<SyncCheckResult> => {
    const res = await api.post<{ data: SyncCheckResult }>(`/v1/packages/sync/${routerId}`);
    return res.data.data;
  },

  syncImport: async (routerId: number, type = "PPPOE"): Promise<ProfileSyncResult> => {
    const res = await api.post<{ data: ProfileSyncResult }>(`/v1/packages/sync-import/${routerId}`, null, { params: { type } });
    return res.data.data;
  },

  getSyncLogs: async (id: number, limit = 20): Promise<SyncLog[]> => {
    const res = await api.get<{ data: SyncLog[] }>(`/v1/packages/${id}/sync-logs`, {
      params: { limit },
    });
    return res.data.data ?? [];
  },
};
