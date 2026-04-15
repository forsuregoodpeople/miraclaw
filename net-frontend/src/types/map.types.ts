export type DeviceType = 'olt' | 'odp' | 'onu' | 'mikrotik';

export interface BaseDevice {
  id: string;
  name: string;
  type: DeviceType;
  latitude: number;
  longitude: number;
  status: 'up' | 'down' | 'pinging' | 'unknown';
  ipAddress?: string;
  parentId?: string; // for ONU -> ODP, ODP -> OLT
  createdAt: string;
  updatedAt: string;
}

export interface OltDevice extends BaseDevice {
  type: 'olt';
  capacity: number; // total ports
  usedPorts: number;
  rxPower?: number; // dBm
  txPower?: number;
}

export interface OdpDevice extends BaseDevice {
  type: 'odp';
  portCount: number;
  connectedOnus: number;
  distanceToOlt?: number; // meters
  rxPower?: number;
  txPower?: number;
}

export interface OnuDevice extends BaseDevice {
  type: 'onu';
  signalAttenuation: number; // dB
  rxPower: number; // dBm
  txPower: number;
  distanceToOdp?: number;
  bandwidth?: number; // Mbps
}

export interface MikrotikDevice extends BaseDevice {
  type: 'mikrotik';
  host: string;
  port: number;
  username: string;
  isActive: boolean;
}

export type MapDevice = OltDevice | OdpDevice | OnuDevice | MikrotikDevice;

export interface FiberLink {
  id: string;
  fromDeviceId: string;
  toDeviceId: string;
  distance: number; // meters
  attenuation: number; // dB
  status: 'active' | 'degraded' | 'broken';
  points: [number, number][]; // polyline coordinates for curved visualization
}

export interface Topology {
  devices: MapDevice[];
  links: FiberLink[];
}

export interface GenieACSData {
  olts: OltDevice[];
  odps: OdpDevice[];
  onus: OnuDevice[];
  lastUpdated: string;
}

export interface SimulationConfig {
  enabled: boolean;
  generateRandomValues: boolean;
  fallbackMode: boolean; // true when GenieACS API unavailable
}

export interface MapViewState {
  center: [number, number];
  zoom: number;
  selectedLayer: string;
  selectedDeviceId: string | null;
  selectedLinkId: string | null;
  editingMode: 'none' | 'add_odp' | 'add_onu' | 'move_device';
  tempLocation: [number, number] | null;
}