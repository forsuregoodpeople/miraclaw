import { api } from "../axios";

export interface Pelanggan {
  id: string;
  name: string;
  type: "DHCP" | "STATIC" | "PPPOE";
  ip: string;
  username: string;
  mac: string;
  status: "UP" | "DOWN";
  is_isolir: boolean;
  last_seen: string;
  router_id: number;
  original_id: number;
  comment: string;
  profile: string;
}

export const PelangganApi = {
  findAll: async (routerId: number): Promise<Pelanggan[]> => {
    const response = await api.get<{ data: Pelanggan[] }>(
      `/v1/mikrotik/${routerId}/pelanggan`
    );
    return response.data.data || [];
  },

  isolir: async (routerId: number, type: string, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pelanggan/${type.toLowerCase()}/${id}/isolir`);
  },

  unIsolir: async (routerId: number, type: string, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pelanggan/${type.toLowerCase()}/${id}/unisolir`);
  },

  block: async (routerId: number, type: string, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pelanggan/${type.toLowerCase()}/${id}/block`);
  },
};
