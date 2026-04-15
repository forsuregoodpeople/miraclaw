import { create } from 'zustand';
import { MapDevice, FiberLink, Topology, SimulationConfig, MapViewState, DeviceType, OltDevice, OdpDevice, OnuDevice, MikrotikDevice } from '@/types/map.types';
import { MikrotikApi, MikrotikRouter } from '@/lib/api/mikrotik';
import { GenieACSApi, OpticalApi } from '@/lib/api/genieacs';
import { mapMikrotikToDevice, generateId, calculateDistance, findNearestDevice, generateCurvedPoints } from '@/lib/map/map-utils';

interface MapStore {
  // Devices
  mikrotikDevices: MikrotikDevice[];
  oltDevices: OltDevice[];
  odpDevices: OdpDevice[];
  onuDevices: OnuDevice[];
  
  // Topology
  fiberLinks: FiberLink[];
  
  // View state
  viewState: MapViewState;
  
  // Simulation
  simulation: SimulationConfig;
  
  // Loading & error states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setMikrotikDevices: (devices: MikrotikDevice[]) => void;
  setOltDevices: (devices: OltDevice[]) => void;
  setOdpDevices: (devices: OdpDevice[]) => void;
  setOnuDevices: (devices: OnuDevice[]) => void;
  
  setFiberLinks: (links: FiberLink[]) => void;
  
  setViewState: (state: Partial<MapViewState>) => void;
  setSimulation: (config: Partial<SimulationConfig>) => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Combined getters
  getAllDevices: () => MapDevice[];
  getDeviceById: (id: string) => MapDevice | undefined;
  getConnectedLinks: (deviceId: string) => FiberLink[];
  
  // Interactive actions
  selectDevice: (deviceId: string | null) => void;
  selectLink: (linkId: string | null) => void;
  
  addDevice: (device: Omit<MapDevice, 'id' | 'createdAt' | 'updatedAt'>, autoConnect?: boolean) => Promise<string>;
  updateDeviceLocation: (deviceId: string, lat: number, lng: number) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
  
  addLink: (link: Omit<FiberLink, 'id'>) => string;
  updateLink: (linkId: string, updates: Partial<FiberLink>) => void;
  deleteLink: (linkId: string) => void;
  
  autoConnectDevice: (deviceId: string) => Promise<void>;
  
  // Data fetching
  fetchMikrotikDevices: () => Promise<void>;
  fetchGenieACSData: () => Promise<void>;
  
  // Simulation fallback
  generateSimulationData: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  mikrotikDevices: [],
  oltDevices: [],
  odpDevices: [],
  onuDevices: [],
  fiberLinks: [],
  
  viewState: {
    center: [-7.5463, 112.2364],
    zoom: 10,
    selectedLayer: 'satellite',
    selectedDeviceId: null,
    selectedLinkId: null,
    editingMode: 'none',
    tempLocation: null,
  },
  
  simulation: {
    enabled: false,
    generateRandomValues: true,
    fallbackMode: false,
  },
  
  isLoading: false,
  error: null,
  
  // Actions
  setMikrotikDevices: (devices) => set({ mikrotikDevices: devices }),
  setOltDevices: (devices) => set({ oltDevices: devices }),
  setOdpDevices: (devices) => set({ odpDevices: devices }),
  setOnuDevices: (devices) => set({ onuDevices: devices }),
  
  setFiberLinks: (links) => set({ fiberLinks: links }),
  
  setViewState: (state) => set((prev) => ({ viewState: { ...prev.viewState, ...state } })),
  setSimulation: (config) => set((prev) => ({ simulation: { ...prev.simulation, ...config } })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  // Getters
  getAllDevices: () => {
    const state = get();
    return [
      ...state.mikrotikDevices,
      ...state.oltDevices,
      ...state.odpDevices,
      ...state.onuDevices,
    ] as MapDevice[];
  },
  
  getDeviceById: (id) => {
    const devices = get().getAllDevices();
    return devices.find(d => d.id === id);
  },
  
  getConnectedLinks: (deviceId) => {
    const links = get().fiberLinks;
    return links.filter(link => link.fromDeviceId === deviceId || link.toDeviceId === deviceId);
  },
  
  // Interactive actions
  selectDevice: (deviceId) => set({ viewState: { ...get().viewState, selectedDeviceId: deviceId, selectedLinkId: null } }),
  selectLink: (linkId) => set({ viewState: { ...get().viewState, selectedLinkId: linkId, selectedDeviceId: null } }),
  
  addDevice: async (deviceData, autoConnect = true) => {
    const { setLoading, setError } = get();
    setLoading(true);
    setError(null);
    
    try {
      let newDevice: MapDevice;
      
      switch (deviceData.type) {
        case 'mikrotik': {
          // Mikrotik routers should be added via the dedicated Mikrotik Management page
          // where password can be properly collected and stored
          throw new Error('Mikrotik routers must be added via Mikrotik Management page. Use the Mikrotik section in the sidebar.');
        }
        
        case 'olt':
        case 'odp':
        case 'onu': {
          // Local simulation devices
          const data = deviceData as any;
          newDevice = {
            ...data,
            id: generateId(data.type),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as MapDevice;
          
          // Add to appropriate slice
          switch (newDevice.type) {
            case 'olt':
              set((prev) => ({ oltDevices: [...prev.oltDevices, newDevice as OltDevice] }));
              break;
            case 'odp':
              set((prev) => ({ odpDevices: [...prev.odpDevices, newDevice as OdpDevice] }));
              break;
            case 'onu':
              set((prev) => ({ onuDevices: [...prev.onuDevices, newDevice as OnuDevice] }));
              break;
          }
          break;
        }
        
        default:
          throw new Error(`Unsupported device type: ${(deviceData as any).type}`);
      }
      
      // Auto-connect logic
      if (autoConnect) {
        await get().autoConnectDevice(newDevice.id);
      }
      
      return newDevice.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add device';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  },
  
  updateDeviceLocation: async (deviceId, lat, lng) => {
    const device = get().getDeviceById(deviceId);
    if (!device) return;
    
    const { setLoading, setError } = get();
    setLoading(true);
    setError(null);
    
    try {
      // Update backend for Mikrotik devices
      if (device.type === 'mikrotik') {
        await MikrotikApi.updateCoordinates(parseInt(deviceId), lat, lng);
      }
      
      // Update local state
      const updated = { ...device, latitude: lat, longitude: lng, updatedAt: new Date().toISOString() };
      
      switch (updated.type) {
        case 'mikrotik':
          set((prev) => ({
            mikrotikDevices: prev.mikrotikDevices.map(d => d.id === deviceId ? updated as MikrotikDevice : d)
          }));
          break;
        case 'olt':
          set((prev) => ({
            oltDevices: prev.oltDevices.map(d => d.id === deviceId ? updated as OltDevice : d)
          }));
          break;
        case 'odp':
          set((prev) => ({
            odpDevices: prev.odpDevices.map(d => d.id === deviceId ? updated as OdpDevice : d)
          }));
          break;
        case 'onu':
          set((prev) => ({
            onuDevices: prev.onuDevices.map(d => d.id === deviceId ? updated as OnuDevice : d)
          }));
          break;
      }
      
      // Update links geometry
      set((prev) => ({
        fiberLinks: prev.fiberLinks.map(link => {
          if (link.fromDeviceId === deviceId || link.toDeviceId === deviceId) {
            const fromDevice = link.fromDeviceId === deviceId ? updated : get().getDeviceById(link.fromDeviceId);
            const toDevice = link.toDeviceId === deviceId ? updated : get().getDeviceById(link.toDeviceId);
            if (fromDevice && toDevice) {
              return {
                ...link,
                points: generateCurvedPoints(
                  fromDevice.latitude, fromDevice.longitude,
                  toDevice.latitude, toDevice.longitude
                ),
              };
            }
          }
          return link;
        })
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update device location';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  },
  
  deleteDevice: async (deviceId) => {
    const device = get().getDeviceById(deviceId);
    if (!device) return;
    
    const { setLoading, setError } = get();
    setLoading(true);
    setError(null);
    
    try {
      // Delete from backend for Mikrotik devices
      if (device.type === 'mikrotik') {
        await MikrotikApi.delete(parseInt(deviceId));
      }
      
      // Remove from local state
      set((prev) => ({
        mikrotikDevices: prev.mikrotikDevices.filter(d => d.id !== deviceId),
        oltDevices: prev.oltDevices.filter(d => d.id !== deviceId),
        odpDevices: prev.odpDevices.filter(d => d.id !== deviceId),
        onuDevices: prev.onuDevices.filter(d => d.id !== deviceId),
        fiberLinks: prev.fiberLinks.filter(link => link.fromDeviceId !== deviceId && link.toDeviceId !== deviceId),
      }));
      
      // Clear selection if deleted device is selected
      if (get().viewState.selectedDeviceId === deviceId) {
        set({ viewState: { ...get().viewState, selectedDeviceId: null } });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete device';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  },
  
  addLink: (link) => {
    const newLink: FiberLink = {
      ...link,
      id: generateId('link'),
    };
    set((prev) => ({ fiberLinks: [...prev.fiberLinks, newLink] }));
    return newLink.id;
  },
  
  updateLink: (linkId, updates) => {
    set((prev) => ({
      fiberLinks: prev.fiberLinks.map(link => 
        link.id === linkId ? { ...link, ...updates } : link
      ),
    }));
  },
  
  deleteLink: (linkId) => {
    set((prev) => ({
      fiberLinks: prev.fiberLinks.filter(link => link.id !== linkId),
    }));
    
    if (get().viewState.selectedLinkId === linkId) {
      set({ viewState: { ...get().viewState, selectedLinkId: null } });
    }
  },
  
  // Helper: auto-connect device to nearest parent
  autoConnectDevice: async (deviceId: string) => {
    const device = get().getDeviceById(deviceId);
    if (!device) return;
    
    const allDevices = get().getAllDevices();
    
    if (device.type === 'onu') {
      // Find nearest ODP
      const nearestOdp = findNearestDevice(
        allDevices.filter(d => d.type === 'odp'),
        device.latitude,
        device.longitude,
        'odp'
      );
      
      if (nearestOdp) {
        const distance = calculateDistance(
          device.latitude, device.longitude,
          nearestOdp.latitude, nearestOdp.longitude
        );
        
        get().addLink({
          fromDeviceId: nearestOdp.id,
          toDeviceId: device.id,
          distance,
          attenuation: 2 + Math.random() * 3,
          status: 'active',
          points: generateCurvedPoints(
            nearestOdp.latitude, nearestOdp.longitude,
            device.latitude, device.longitude
          ),
        });
      }
    } else if (device.type === 'odp') {
      // Find nearest OLT
      const nearestOlt = findNearestDevice(
        allDevices.filter(d => d.type === 'olt'),
        device.latitude,
        device.longitude,
        'olt'
      );
      
      if (nearestOlt) {
        const distance = calculateDistance(
          device.latitude, device.longitude,
          nearestOlt.latitude, nearestOlt.longitude
        );
        
        get().addLink({
          fromDeviceId: nearestOlt.id,
          toDeviceId: device.id,
          distance,
          attenuation: 1.5 + Math.random() * 1.5,
          status: 'active',
          points: generateCurvedPoints(
            nearestOlt.latitude, nearestOlt.longitude,
            device.latitude, device.longitude
          ),
        });
      }
    }
  },
  
  // Data fetching
  fetchMikrotikDevices: async () => {
    const { setLoading, setError, setMikrotikDevices } = get();
    setLoading(true);
    setError(null);
    
    try {
      const routers = await MikrotikApi.findAll();
      const devices = routers.map(mapMikrotikToDevice);
      setMikrotikDevices(devices);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch Mikrotik devices';
      setError(message);
    } finally {
      setLoading(false);
    }
  },
  
  fetchGenieACSData: async () => {
    const { setLoading, setError, setOltDevices, setOdpDevices, setOnuDevices, setFiberLinks, setSimulation } = get();
    setLoading(true);
    setError(null);

    try {
      const [olts, odps, onus] = await Promise.all([
        OpticalApi.listOLT(),
        OpticalApi.listODP(),
        OpticalApi.listONU(),
      ]);

      const mappedOlts: OltDevice[] = olts.map((d) => ({
        id: `olt_${d.id}`,
        name: d.name,
        type: 'olt' as const,
        latitude: d.latitude ?? 0,
        longitude: d.longitude ?? 0,
        status: d.is_active ? 'up' : 'unknown',
        ipAddress: d.ip_address,
        capacity: 16,
        usedPorts: 0,
        createdAt: d.created_at ?? new Date().toISOString(),
        updatedAt: d.updated_at ?? new Date().toISOString(),
      }));

      const mappedOdps: OdpDevice[] = odps.map((d) => ({
        id: `odp_${d.id}`,
        name: d.name,
        type: 'odp' as const,
        latitude: d.latitude ?? 0,
        longitude: d.longitude ?? 0,
        status: d.fault_suspected ? 'down' : (d.is_active ? 'up' : 'unknown'),
        ipAddress: d.ip_address,
        parentId: d.odp_id ? `olt_${d.odp_id}` : undefined,
        portCount: 8,
        connectedOnus: d.total_onus ?? 0,
        distanceToOlt: 0,
        createdAt: d.created_at ?? new Date().toISOString(),
        updatedAt: d.updated_at ?? new Date().toISOString(),
      }));

      const mappedOnus: OnuDevice[] = onus.map((d) => {
        const ls = d.latest_status?.link_status;
        const status = ls === 'up' ? 'up' : ls === 'down' ? 'down' : 'unknown';
        return {
          id: `onu_${d.id}`,
          name: d.name,
          type: 'onu' as const,
          latitude: d.latitude ?? 0,
          longitude: d.longitude ?? 0,
          status,
          ipAddress: d.ip_address,
          parentId: d.odp_id ? `odp_${d.odp_id}` : undefined,
          signalAttenuation: d.latest_status?.attenuation ?? 0,
          rxPower: d.latest_status?.rx_power ?? 0,
          txPower: d.latest_status?.tx_power ?? 0,
          distanceToOdp: 0,
          bandwidth: 100,
          createdAt: d.created_at ?? new Date().toISOString(),
          updatedAt: d.updated_at ?? new Date().toISOString(),
        };
      });

      const links: FiberLink[] = [];
      mappedOdps.forEach((odp) => {
        if (odp.parentId) {
          const fromDevice = get().getAllDevices().find(d => d.id === odp.parentId) ??
            mappedOlts.find(o => o.id === odp.parentId);
          links.push({
            id: `link_${odp.parentId}_${odp.id}`,
            fromDeviceId: odp.parentId,
            toDeviceId: odp.id,
            distance: 300,
            attenuation: 1.5,
            status: odp.status === 'up' ? 'active' : 'degraded',
            points: fromDevice
              ? generateCurvedPoints(fromDevice.latitude, fromDevice.longitude, odp.latitude, odp.longitude)
              : [[odp.latitude, odp.longitude], [odp.latitude, odp.longitude]],
          });
        }
      });
      mappedOnus.forEach((onu) => {
        if (onu.parentId) {
          const fromDevice = mappedOdps.find(o => o.id === onu.parentId);
          links.push({
            id: `link_${onu.parentId}_${onu.id}`,
            fromDeviceId: onu.parentId,
            toDeviceId: onu.id,
            distance: 120,
            attenuation: 2.0,
            status: onu.status === 'up' ? 'active' : 'degraded',
            points: fromDevice
              ? generateCurvedPoints(fromDevice.latitude, fromDevice.longitude, onu.latitude, onu.longitude)
              : [[onu.latitude, onu.longitude], [onu.latitude, onu.longitude]],
          });
        }
      });

      setOltDevices(mappedOlts);
      setOdpDevices(mappedOdps);
      setOnuDevices(mappedOnus);
      setFiberLinks(links);
      setSimulation({ fallbackMode: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GenieACS API unavailable';
      setError(message);
      setSimulation({ fallbackMode: true });
      get().generateSimulationData();
    } finally {
      setLoading(false);
    }
  },
  
  generateSimulationData: () => {
    const { setOltDevices, setOdpDevices, setOnuDevices, setFiberLinks } = get();
    
    const simulated = GenieACSApi.generateSimulation();
    setOltDevices(simulated.olts);
    setOdpDevices(simulated.odps);
    setOnuDevices(simulated.onus);
    setFiberLinks(simulated.links);
  },
}));