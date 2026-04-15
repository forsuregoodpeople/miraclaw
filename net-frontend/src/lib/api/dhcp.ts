import axios from "axios";
import { api } from "../axios";

export interface DHCPLease {
  id: number;
  router_id: number;
  address: string;
  mac_address: string;
  host_name: string;
  client_id: string;
  server: string;
  status: string;
  expires_after: string;
  dynamic: boolean;
  is_isolir: boolean;
  block_type: "none" | "isolir" | "blokir";
  active_address: string;
  active_mac: string;
  active_server: string;
  active_state: boolean;
  last_seen: string;
  comment: string;
}

export interface DHCPServer {
  name: string;
  interface: string;
  address_pool: string;
  lease_time: string;
}

export const DHCPApi = {
  findAll: async (routerId: number): Promise<DHCPLease[]> => {
    const response = await api.get<{ data: DHCPLease[] }>(`/v1/mikrotik/${routerId}/dhcp`);
    return response.data.data || [];
  },

  findById: async (routerId: number, id: number): Promise<DHCPLease> => {
    const response = await api.get<{ data: DHCPLease }>(`/v1/mikrotik/${routerId}/dhcp/${id}`);
    return response.data.data;
  },

  create: async (routerId: number, data: Partial<DHCPLease>): Promise<DHCPLease> => {
    const response = await api.post<{ data: DHCPLease }>(`/v1/mikrotik/${routerId}/dhcp`, data);
    return response.data.data;
  },

  update: async (routerId: number, id: number, data: Partial<DHCPLease>): Promise<DHCPLease> => {
    const response = await api.put<{ data: DHCPLease }>(`/v1/mikrotik/${routerId}/dhcp/${id}`, data);
    return response.data.data;
  },

  isolir: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/${id}/disable`);
  },

  unIsolir: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/${id}/enable`);
  },

  block: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/${id}/block`);
  },

  delete: async (routerId: number, id: number): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/dhcp/${id}`);
  },

  syncFromRouter: async (routerId: number): Promise<DHCPLease[]> => {
    const response = await api.post<{ data: DHCPLease[] }>(`/v1/mikrotik/${routerId}/dhcp/sync`);
    return response.data.data || [];
  },

  getServers: async (routerId: number): Promise<DHCPServer[]> => {
    const response = await api.get<{ data: DHCPServer[] }>(`/v1/mikrotik/${routerId}/dhcp/servers`);
    return response.data.data || [];
  },

  getPools: async (routerId: number): Promise<string[]> => {
    const response = await api.get<{ data: string[] }>(`/v1/mikrotik/${routerId}/dhcp/pools`);
    return response.data.data || [];
  },

  createPool: async (routerId: number, data: { name: string; ranges: string; next_pool?: string }): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/pools`, data);
  },

  createServer: async (routerId: number, data: Partial<DHCPServer>): Promise<DHCPServer> => {
    const response = await api.post<{ data: DHCPServer }>(`/v1/mikrotik/${routerId}/dhcp/servers`, data);
    return response.data.data;
  },

  makeStatic: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/${id}/make-static`);
  },

  makeDynamic: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/dhcp/${id}/make-dynamic`);
  },

  deleteServer: async (routerId: number, serverName: string): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/dhcp/servers/${encodeURIComponent(serverName)}`);
  },

  deletePool: async (routerId: number, poolName: string): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/dhcp/pools/${encodeURIComponent(poolName)}`);
  },
};
