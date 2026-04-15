import { api } from "@/lib/axios";
import { OltDevice, OdpDevice, OnuDevice, FiberLink } from "@/types/map.types";
import type {
  OpticalDevice,
  OpticalAlert,
  OpticalStatus,
  ODPSummary,
  GenieACSDevice,
  FiberCable,
} from "@/types/optical.types";

export interface GenieACSResponse {
  success: boolean;
  data?: {
    olts: OltDevice[];
    odps: OdpDevice[];
    onus: OnuDevice[];
    links: FiberLink[];
  };
  error?: string;
  fallback?: boolean;
}

export interface SimulationOptions {
  generateRandomValues?: boolean;
  count?: {
    olts?: number;
    odpsPerOlt?: number;
    onusPerOdp?: number;
  };
}

const handleApiError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unknown error occurred";
};

/**
 * Fetch GenieACS data with automatic fallback to simulation
 */
export const fetchGenieACSData = async (options: SimulationOptions = {}): Promise<GenieACSResponse> => {
  try {
    const response = await api.get("/api/genieacs");
    if (response.data.success) {
      return {
        success: true,
        data: response.data.data,
      };
    } else {
      throw new Error(response.data.error || "GenieACS API returned error");
    }
  } catch (error) {
    // GenieACS API unavailable, falling back to simulation
    const simulated = generateSimulationData(options);
    return {
      success: true,
      data: simulated,
      fallback: true,
    };
  }
};

/**
 * Generate realistic simulation data for fiber topology
 */
export const generateSimulationData = (options: SimulationOptions = {}): {
  olts: OltDevice[];
  odps: OdpDevice[];
  onus: OnuDevice[];
  links: FiberLink[];
} => {
  const {
    generateRandomValues = true,
    count = { olts: 1, odpsPerOlt: 4, onusPerOdp: 3 },
  } = options;

  const olts: OltDevice[] = [];
  const odps: OdpDevice[] = [];
  const onus: OnuDevice[] = [];
  const links: FiberLink[] = [];

  const baseLat = -7.5463;
  const baseLng = 112.2364;

  // Generate OLTs
  for (let o = 0; o < (count.olts || 1); o++) {
    const olt: OltDevice = {
      id: `olt_${Date.now()}_${o}`,
      name: `OLT-${o + 1}`,
      type: "olt",
      latitude: baseLat + (Math.random() - 0.5) * 0.01,
      longitude: baseLng + (Math.random() - 0.5) * 0.01,
      status: "up",
      ipAddress: `10.0.${o}.1`,
      capacity: 16,
      usedPorts: Math.floor(Math.random() * 12) + 1,
      rxPower: generateRandomValues ? -8 + Math.random() * 4 : -8.5,
      txPower: generateRandomValues ? 1.5 + Math.random() * 2 : 2.3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    olts.push(olt);

    // Generate ODPs for this OLT
    const odpCount = count.odpsPerOlt || 4;
    for (let d = 0; d < odpCount; d++) {
      const odp: OdpDevice = {
        id: `odp_${olt.id}_${d}`,
        name: `ODP-${o + 1}-${d + 1}`,
        type: "odp",
        latitude: olt.latitude + (Math.random() - 0.5) * 0.02,
        longitude: olt.longitude + (Math.random() - 0.5) * 0.02,
        status: Math.random() > 0.15 ? "up" : "down",
        ipAddress: `10.${o}.${d}.1`,
        parentId: olt.id,
        portCount: 8,
        connectedOnus: 0, // will be updated
        distanceToOlt: Math.floor(Math.random() * 500) + 100,
        rxPower: generateRandomValues ? -12 + Math.random() * 4 : -12.5,
        txPower: generateRandomValues ? 1.5 + Math.random() * 2 : 1.8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      odps.push(odp);

      // Create OLT -> ODP link
      links.push({
        id: `link_${olt.id}_${odp.id}`,
        fromDeviceId: olt.id,
        toDeviceId: odp.id,
        distance: odp.distanceToOlt || 300,
        attenuation: generateRandomValues ? 1.2 + Math.random() * 1.5 : 1.8,
        status: odp.status === "up" ? "active" : "degraded",
        points: [[olt.latitude, olt.longitude], [odp.latitude, odp.longitude]],
      });

      // Generate ONUs for this ODP
      const onuCount = count.onusPerOdp || 3;
      for (let n = 0; n < onuCount; n++) {
        const onu: OnuDevice = {
          id: `onu_${odp.id}_${n}`,
          name: `ONU-${o + 1}-${d + 1}-${n + 1}`,
          type: "onu",
          latitude: odp.latitude + (Math.random() - 0.5) * 0.005,
          longitude: odp.longitude + (Math.random() - 0.5) * 0.005,
          status: Math.random() > 0.2 ? "up" : "down",
          ipAddress: `192.168.${d}.${n + 10}`,
          parentId: odp.id,
          signalAttenuation: generateRandomValues ? 2 + Math.random() * 4 : 3.5,
          rxPower: generateRandomValues ? -8 - Math.random() * 20 : -22.5, // -28 to -8 dBm
          txPower: generateRandomValues ? 1 + Math.random() * 2 : 1.5,
          distanceToOdp: Math.floor(Math.random() * 200) + 50,
          bandwidth: 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onus.push(onu);

        // Create ODP -> ONU link
        links.push({
          id: `link_${odp.id}_${onu.id}`,
          fromDeviceId: odp.id,
          toDeviceId: onu.id,
          distance: onu.distanceToOdp || 120,
          attenuation: generateRandomValues ? 2 + Math.random() * 3 : 2.5,
          status: onu.status === "up" ? "active" : "degraded",
          points: [[odp.latitude, odp.longitude], [onu.latitude, onu.longitude]],
        });
      }

      // Update connected ONU count
      odp.connectedOnus = onuCount;
    }
  }

  return { olts, odps, onus, links };
};

/**
 * Send command to GenieACS (simulated)
 */
export const sendGenieACSCommand = async (command: string, params: any): Promise<any> => {
  try {
    const response = await api.post("/api/genieacs/command", { command, params });
    return response.data;
  } catch (error) {
    // GenieACS command failed, simulating response
    // Simulate successful command response
    return {
      success: true,
      message: "Command executed (simulated)",
      timestamp: new Date().toISOString(),
    };
  }
};

// --- Real backend API functions ---

export const OpticalApi = {
  // GenieACS proxy
  listGenieACSDevices: async (): Promise<GenieACSDevice[]> => {
    const res = await api.get("/v1/optical/genieacs/devices");
    return (res.data.data as GenieACSDevice[]) || [];
  },

  getGenieACSDevice: async (id: string): Promise<GenieACSDevice | null> => {
    const res = await api.get(`/v1/optical/genieacs/devices/${encodeURIComponent(id)}`);
    return (res.data.data as GenieACSDevice) || null;
  },

  getGenieACSSettings: async (): Promise<{ url: string; username: string }> => {
    const res = await api.get("/v1/optical/genieacs/settings");
    return res.data.data || { url: "", username: "" };
  },

  updateGenieACSSettings: async (settings: { url: string; username: string; password?: string }): Promise<void> => {
    await api.put("/v1/optical/genieacs/settings", settings);
  },

  importGenieACSDevice: async (genieacsId: string, payload: {
    device_type: "olt" | "odp" | "onu";
    name: string;
    odp_id?: number;
  }): Promise<OpticalDevice> => {
    const res = await api.post(`/v1/optical/genieacs/devices/${encodeURIComponent(genieacsId)}/import`, payload);
    return res.data.data as OpticalDevice;
  },

  // OLT
  listOLT: async (): Promise<OpticalDevice[]> => {
    const res = await api.get("/v1/optical/olt");
    return (res.data.data as OpticalDevice[]) || [];
  },

  createOLT: async (data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.post("/v1/optical/olt", data);
    return res.data.data as OpticalDevice;
  },

  updateOLT: async (id: number, data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.put(`/v1/optical/olt/${id}`, data);
    return res.data.data as OpticalDevice;
  },

  deleteOLT: async (id: number): Promise<void> => {
    await api.delete(`/v1/optical/olt/${id}`);
  },

  // ODP
  listODP: async (): Promise<ODPSummary[]> => {
    const res = await api.get("/v1/optical/odp");
    return (res.data.data as ODPSummary[]) || [];
  },

  getODP: async (id: number): Promise<OpticalDevice | null> => {
    const res = await api.get(`/v1/optical/odp/${id}`);
    return (res.data.data as OpticalDevice) || null;
  },

  createODP: async (data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.post("/v1/optical/odp", data);
    return res.data.data as OpticalDevice;
  },

  updateODP: async (id: number, data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.put(`/v1/optical/odp/${id}`, data);
    return res.data.data as OpticalDevice;
  },

  deleteODP: async (id: number): Promise<void> => {
    await api.delete(`/v1/optical/odp/${id}`);
  },

  adjustODPPorts: async (id: number, delta: number): Promise<void> => {
    await api.post(`/v1/optical/odp/${id}/ports`, { delta });
  },

  uploadODPPhoto: async (id: number, file: File): Promise<string> => {
    const form = new FormData();
    form.append("photo", file);
    const res = await api.post(`/v1/optical/odp/${id}/photo`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return (res.data.data as { photo_url: string }).photo_url;
  },

  // ONU
  listONU: async (): Promise<OpticalDevice[]> => {
    const res = await api.get("/v1/optical/onu");
    return (res.data.data as OpticalDevice[]) || [];
  },

  createONU: async (data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.post("/v1/optical/onu", data);
    return res.data.data as OpticalDevice;
  },

  updateONU: async (id: number, data: Partial<OpticalDevice>): Promise<OpticalDevice> => {
    const res = await api.put(`/v1/optical/onu/${id}`, data);
    return res.data.data as OpticalDevice;
  },

  deleteONU: async (id: number): Promise<void> => {
    await api.delete(`/v1/optical/onu/${id}`);
  },

  // Fiber Cables
  listCables: async (): Promise<FiberCable[]> => {
    const res = await api.get("/v1/optical/cables");
    return (res.data.data as FiberCable[]) || [];
  },

  createCable: async (data: Omit<FiberCable, "id" | "created_at" | "updated_at">): Promise<FiberCable> => {
    const res = await api.post("/v1/optical/cables", data);
    return res.data.data as FiberCable;
  },

  updateCable: async (id: number, data: Partial<FiberCable>): Promise<FiberCable> => {
    const res = await api.put(`/v1/optical/cables/${id}`, data);
    return res.data.data as FiberCable;
  },

  deleteCable: async (id: number): Promise<void> => {
    await api.delete(`/v1/optical/cables/${id}`);
  },

  getONUHistory: async (id: number, limit = 100): Promise<OpticalStatus[]> => {
    const res = await api.get(`/v1/optical/onu/${id}/history`, { params: { limit } });
    return (res.data.data as OpticalStatus[]) || [];
  },

  // Alerts
  listAlerts: async (): Promise<OpticalAlert[]> => {
    const res = await api.get("/v1/optical/alerts");
    return (res.data.data as OpticalAlert[]) || [];
  },

  resolveAlert: async (id: number): Promise<void> => {
    await api.put(`/v1/optical/alerts/${id}/resolve`);
  },
};

export const GenieACSApi = {
  fetchData: fetchGenieACSData,
  generateSimulation: generateSimulationData,
  sendCommand: sendGenieACSCommand,
};

export default GenieACSApi;