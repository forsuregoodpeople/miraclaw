export type OpticalDeviceType = "olt" | "odp" | "onu";
export type OpticalLinkStatus = "up" | "down" | "degraded" | "unknown";
export type OpticalAlertType =
  | "rx_below_threshold"
  | "odp_fault_suspected"
  | "device_unreachable"
  | "tx_below_threshold";
export type OpticalSeverity = "info" | "warning" | "critical";
export type OpticalVendor = "zte" | "huawei" | "fiberhome" | "";

export interface OpticalDevice {
  id: number;
  name: string;
  device_type: OpticalDeviceType;
  serial?: string;
  genieacs_id?: string;
  odp_id?: number;
  ip_address?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  vendor?: OpticalVendor;
  rx_param_path?: string;
  tx_param_path?: string;
  // ODP-specific
  total_ports?: number;
  used_ports?: number;
  mikrotik_id?: number;
  technician_id?: number;
  photo_url?: string;
  created_at?: string;
  updated_at?: string;
  latest_status?: OpticalStatus;
}

export interface OpticalStatus {
  id: number;
  device_id: number;
  rx_power: number | null;
  tx_power: number | null;
  attenuation: number | null;
  link_status: OpticalLinkStatus;
  polled_at: string;
}

export interface OpticalAlert {
  id: number;
  device_id: number;
  alert_type: OpticalAlertType;
  severity: OpticalSeverity;
  message: string;
  rx_power?: number;
  last_seen_at: string;
  resolved_at?: string;
  created_at: string;
}

export interface ODPSummary extends OpticalDevice {
  total_onus: number;
  down_onus: number;
  degraded_onus: number;
  fault_suspected: boolean;
  available_ports: number;
}

export interface OpticalStatusUpdate {
  type: "optical_status_update";
  device_id: number;
  status: OpticalStatus;
  timestamp: string;
}

// GenieACS device as returned by the NBI proxy endpoint
export interface GenieACSDevice {
  _id: string;
  _lastInform?: string;
  _tags?: string[];
  _deviceId?: {
    _Manufacturer?: string;
    _OUI?: string;
    _ProductClass?: string;
    _SerialNumber?: string;
  };
  [key: string]: unknown;
}

export interface FiberCable {
  id: number;
  name: string;
  from_device_id?: number;
  to_device_id?: number;
  points: [number, number][];
  cable_type: 'fiber' | 'drop' | 'trunk';
  color: string;
  length_m?: number;
  notes?: string;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}
