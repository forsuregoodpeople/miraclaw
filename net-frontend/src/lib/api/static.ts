import { api } from "../axios";

export interface StaticBinding {
  id: number;
  router_id: number;
  address: string;
  mac_address: string;
  server: string;
  type: "bypassed" | "blocked" | "regular";
  to_address: string;
  comment: string;
  is_disabled: boolean;
  is_online: boolean;
  last_seen: string; // Format from RouterOS: "3d2h5m30s", "2h5m", "45s", or "never"
  updated_at: string; // ISO timestamp for sorting
}

export interface HotspotServer {
  name: string;
  interface: string;
  address_pool: string;
  profile: string;
  idle_timeout: string;
}

export const StaticApi = {
  findAll: async (routerId: number): Promise<StaticBinding[]> => {
    const response = await api.get<{ data: StaticBinding[] }>(
      `/v1/mikrotik/${routerId}/static`
    );
    return response.data.data || [];
  },

  findById: async (routerId: number, id: number): Promise<StaticBinding> => {
    const response = await api.get<{ data: StaticBinding }>(
      `/v1/mikrotik/${routerId}/static/${id}`
    );
    return response.data.data;
  },

  create: async (
    routerId: number,
    data: Partial<StaticBinding>
  ): Promise<StaticBinding> => {
    const response = await api.post<{ data: StaticBinding }>(
      `/v1/mikrotik/${routerId}/static`,
      data
    );
    return response.data.data;
  },

  update: async (
    routerId: number,
    id: number,
    data: Partial<StaticBinding>
  ): Promise<StaticBinding> => {
    const response = await api.put<{ data: StaticBinding }>(
      `/v1/mikrotik/${routerId}/static/${id}`,
      data
    );
    return response.data.data;
  },

  delete: async (routerId: number, id: number): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/static/${id}`);
  },

  block: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/static/${id}/block`);
  },

  unblock: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/static/${id}/unblock`);
  },

  syncFromRouter: async (routerId: number): Promise<StaticBinding[]> => {
    const response = await api.post<{ data: StaticBinding[] }>(
      `/v1/mikrotik/${routerId}/static/sync`
    );
    return response.data.data || [];
  },

  getHotspotServers: async (routerId: number): Promise<HotspotServer[]> => {
    const response = await api.get<{ data: HotspotServer[] }>(
      `/v1/mikrotik/${routerId}/static/hotspot-servers`
    );
    return response.data.data || [];
  },

  createHotspotServer: async (
    routerId: number,
    data: Partial<HotspotServer>
  ): Promise<HotspotServer> => {
    const response = await api.post<{ data: HotspotServer }>(
      `/v1/mikrotik/${routerId}/static/hotspot-servers`,
      data
    );
    return response.data.data;
  },
};
