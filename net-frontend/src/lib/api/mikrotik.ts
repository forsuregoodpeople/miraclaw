import axios from "axios";
import { api } from "../axios";

export interface MikrotikRouter {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  mitra_id: number;
  status: string;
  is_active: boolean;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceData {
  "free-memory": string;
  "total-memory": string;
  "free-hdd-space": string;
  "total-hdd-space": string;
  "cpu-load": string;
  "uptime": string;
  "board-name": string;
  "version": string;
  [key: string]: string;
}

export interface InterfaceData {
  name: string;
  type: string;
  mtu: string;
  running: boolean | string;
  disabled: boolean | string;
  comment: string;
  "rx-byte": string;
  "tx-byte": string;
  "rx-signal"?: string;
  "tx-signal"?: string;
  "signal-strength"?: string;
  "last-link-down-time"?: string;
  "last-link-up-time"?: string;
  "rx-bps"?: number;
  "tx-bps"?: number;
}

export interface PPPOESession {
  name: string;
  address: string;
  "caller-id": string;
  uptime: string;
  encoding: string;
  "limit-bytes-in": string;
  "limit-bytes-out": string;
  "bytes-in": string;
  "bytes-out": string;
  disabled?: string | boolean;
  profile?: string;
  service?: string;
  comment?: string;
}

export interface PPPOESecret {
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

export interface PingResult {
  success: boolean;
  latency_ms: number;
  error?: string;
  timestamp: string;
}

export interface LoginResponse {
  status_code: number;
  message: string;
  data?: unknown;
}

const handleError = (error: unknown, defaultMessage: string): never => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) throw new Error("Unauthorized");
    if (status === 403) throw new Error("Forbidden");
    if (status === 404) throw new Error("Router not found");
  }
  throw new Error(defaultMessage);
};

export const MikrotikApi = {
  findAll: async (): Promise<MikrotikRouter[]> => {
    const response = await api.get<LoginResponse>("/v1/mikrotik");
    return (response.data.data as MikrotikRouter[]) || [];
  },

  create: async (data: Partial<MikrotikRouter>): Promise<MikrotikRouter> => {
    const response = await api.post<LoginResponse>("/v1/mikrotik", data);
    return response.data.data as MikrotikRouter;
  },

  update: async (id: number, data: Partial<MikrotikRouter>): Promise<MikrotikRouter> => {
    const response = await api.put<LoginResponse>(`/v1/mikrotik/${id}`, data);
    return response.data.data as MikrotikRouter;
  },

  updateCoordinates: async (id: number, latitude: number | null, longitude: number | null): Promise<MikrotikRouter> => {
    const response = await api.patch<LoginResponse>(`/v1/mikrotik/${id}/coordinates`, { latitude, longitude });
    return response.data.data as MikrotikRouter;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/v1/mikrotik/${id}`);
  },

  getResources: async (routerId: number): Promise<ResourceData> => {
    const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/resources`);
    return response.data.data as ResourceData;
  },

  getInterfaces: async (routerId: number): Promise<InterfaceData[]> => {
    const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/interfaces`);
    return (response.data.data as InterfaceData[]) || [];
  },

  pingRouter: async (routerId: number): Promise<PingResult> => {
    try {
      const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/ping`);
      return response.data.data as PingResult;
    } catch (error) {
      // Ping API Error
      // Return a structured error response for consistent handling
      return {
        success: false,
        latency_ms: 0,
        error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : "Unknown error",
        timestamp: new Date().toISOString()
      };
    }
  },

  updateRouterStatus: async (routerId: number, status: string): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/status`, { status });
  },

  toggleRouterActive: async (routerId: number): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/active`);
  },

  executeTerminalCommand: async (data: {
    router_id: number;
    commands: string[];
    timeout?: number;
  }): Promise<any> => {
    const response = await api.post("/v1/mikrotik/terminal", data);
    return response.data.data;
  },

  // PPPoE Secrets
  getPPPOESecrets: async (routerId: number): Promise<PPPOESecret[]> => {
    const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/pppoe`);
    return (response.data.data as PPPOESecret[]) || [];
  },

  getPPPOESessions: async (routerId: number): Promise<PPPOESession[]> => {
    const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/pppoe/sessions`);
    return (response.data.data as PPPOESession[]) || [];
  },

  getPPPOESecretByName: async (routerId: number, name: string): Promise<PPPOESecret> => {
    const response = await api.get<LoginResponse>(`/v1/mikrotik/${routerId}/pppoe/by-name/${name}`);
    return response.data.data as PPPOESecret;
  },

  createPPPOESecret: async (routerId: number, data: Partial<PPPOESecret>): Promise<PPPOESecret> => {
    const response = await api.post<LoginResponse>(`/v1/mikrotik/${routerId}/pppoe`, data);
    return response.data.data as PPPOESecret;
  },

  updatePPPOESecret: async (routerId: number, id: number, data: Partial<PPPOESecret>): Promise<PPPOESecret> => {
    const response = await api.put<LoginResponse>(`/v1/mikrotik/${routerId}/pppoe/${id}`, data);
    return response.data.data as PPPOESecret;
  },

  deletePPPOESecret: async (routerId: number, id: number): Promise<void> => {
    await api.delete(`/v1/mikrotik/${routerId}/pppoe/${id}`);
  },

  disconnectPPPOESession: async (routerId: number, sessionName: string): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/disconnect`, { session_name: sessionName });
  },

  blockPPPOESecret: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/${id}/block`);
  },

  unblockPPPOESecret: async (routerId: number, id: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/${id}/unblock`);
  },

  updatePPPOESessionComment: async (routerId: number, sessionName: string, comment: string): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/pppoe/session/${sessionName}/comment`, { comment });
  },

  // Interface management
  updateInterfaceComment: async (routerId: number, interfaceName: string, comment: string): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/interfaces/${encodeURIComponent(interfaceName)}/comment`, { comment });
  },

  renameInterface: async (routerId: number, oldName: string, newName: string): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/interfaces/${encodeURIComponent(oldName)}/rename`, { new_name: newName });
  },

  toggleInterfaceStatus: async (routerId: number, interfaceName: string, disabled: boolean): Promise<void> => {
    await api.put(`/v1/mikrotik/${routerId}/interfaces/${encodeURIComponent(interfaceName)}/toggle`, { disabled });
  },

  syncPPPOESessions: async (routerId: number): Promise<void> => {
    await api.post(`/v1/mikrotik/${routerId}/pppoe/sync`);
  },
};

export default MikrotikApi;
