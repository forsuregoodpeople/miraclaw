import { api } from "../axios";

export interface PPPoESecret {
  id: number;
  router_id: number;
  name: string;
  password: string;
  profile: string;
  service: string;
  local_address: string;
  remote_address: string;
  comment: string;
  disabled: boolean;
}

export interface PPPoEProfile {
  name: string;
  local_address: string;
  remote_address: string;
  rate_limit: string;
  bridge: string;
  incoming_filter: string;
  outgoing_filter: string;
}

export const PPPoEApi = {
  findAll: async (routerId: number): Promise<PPPoESecret[]> => {
    const response = await api.get<{ data: PPPoESecret[] }>(`/v1/mikrotik/${routerId}/pppoe`);
    return response.data.data || [];
  },

  findById: async (routerId: number, id: number): Promise<PPPoESecret> => {
    const response = await api.get<{ data: PPPoESecret }>(`/v1/mikrotik/${routerId}/pppoe/${id}`);
    return response.data.data;
  },

  create: async (routerId: number, data: Partial<PPPoESecret>): Promise<PPPoESecret> => {
    const response = await api.post<{ data: PPPoESecret }>(`/v1/mikrotik/${routerId}/pppoe`, data);
    return response.data.data;
  },

  update: async (routerId: number, id: number, data: Partial<PPPoESecret>): Promise<PPPoESecret> => {
    const response = await api.put<{ data: PPPoESecret }>(`/v1/mikrotik/${routerId}/pppoe/${id}`, data);
    return response.data.data;
  },

  delete: async (routerId: number, id: number): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/pppoe/${id}`);
  },

  getProfiles: async (routerId: number): Promise<PPPoEProfile[]> => {
    const response = await api.get<{ data: PPPoEProfile[] }>(`/v1/mikrotik/${routerId}/pppoe/profiles`);
    return response.data.data || [];
  },

  createProfile: async (routerId: number, data: Partial<PPPoEProfile>): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/profiles`, data);
  },

  updateProfile: async (routerId: number, profileName: string, data: Partial<PPPoEProfile>): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/pppoe/profiles/${encodeURIComponent(profileName)}`, data);
  },

  deleteProfile: async (routerId: number, profileName: string): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/pppoe/profiles/${encodeURIComponent(profileName)}`);
  },

  getProfileUsage: async (routerId: number): Promise<Record<string, number>> => {
    const response = await api.get<{ data: Record<string, number> }>(`/v1/mikrotik/${routerId}/pppoe/profiles/usage`);
    return response.data.data || {};
  },

  sync: async (routerId: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/sync`);
  },
};
