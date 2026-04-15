import { MikrotikRouter } from "@/lib/api/mikrotik";
import { MikrotikDevice, MapDevice, DeviceType, OltDevice, OdpDevice, OnuDevice, FiberLink } from "@/types/map.types";

/**
 * Convert MikrotikRouter to MikrotikDevice
 */
export const mapMikrotikToDevice = (router: MikrotikRouter): MikrotikDevice => ({
  id: router.id.toString(),
  name: router.name,
  type: 'mikrotik',
  latitude: router.latitude || 0,
  longitude: router.longitude || 0,
  status: router.status as 'up' | 'down' | 'pinging' | 'unknown',
  ipAddress: router.host,
  host: router.host,
  port: router.port,
  username: router.username,
  isActive: router.is_active,
  createdAt: router.created_at,
  updatedAt: router.updated_at,
});

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Find nearest device of a given type
 */
export const findNearestDevice = (
  devices: MapDevice[],
  targetLat: number,
  targetLng: number,
  filterType?: DeviceType
): MapDevice | null => {
  let nearest: MapDevice | null = null;
  let minDistance = Infinity;

  devices.forEach(device => {
    if (filterType && device.type !== filterType) return;
    const dist = calculateDistance(targetLat, targetLng, device.latitude, device.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = device;
    }
  });

  return nearest;
};

/**
 * Generate curved polyline points for visual appeal
 */
export const generateCurvedPoints = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  curvature = 0.3
): [number, number][] => {
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  
  // Calculate control point offset
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const norm = Math.sqrt(dx * dx + dy * dy);
  
  if (norm === 0) return [[lat1, lng1], [lat2, lng2]];
  
  const offsetX = -dy / norm * curvature;
  const offsetY = dx / norm * curvature;
  
  const controlLat = midLat + offsetX;
  const controlLng = midLng + offsetY;
  
  // Simple quadratic bezier with 5 points
  const points: [number, number][] = [];
  for (let t = 0; t <= 1; t += 0.25) {
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
    points.push([lat, lng]);
  }
  
  return points;
};

/**
 * Debounce function for limiting API calls with cancel capability
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced as ((...args: Parameters<T>) => void) & { cancel: () => void };
};

/**
 * Generate realistic signal attenuation based on distance
 */
export const calculateAttenuation = (distance: number, fiberType: 'smf' | 'mmf' = 'smf'): number => {
  // Simplified attenuation model (dB/km)
  const attenuationPerKm = fiberType === 'smf' ? 0.2 : 0.5;
  return (distance / 1000) * attenuationPerKm + Math.random() * 0.5;
};

/**
 * Format dBm values with appropriate color coding
 */
export const formatDBm = (value: number): { text: string; color: string } => {
  if (value >= -10) return { text: `${value.toFixed(1)} dBm`, color: 'text-red-600' };
  if (value >= -20) return { text: `${value.toFixed(1)} dBm`, color: 'text-yellow-600' };
  if (value >= -28) return { text: `${value.toFixed(1)} dBm`, color: 'text-green-600' };
  return { text: `${value.toFixed(1)} dBm`, color: 'text-red-700' };
};

/**
 * Validate device data
 */
export const validateDevice = (device: Partial<MapDevice>): string[] => {
  const errors: string[] = [];
  
  if (!device.name?.trim()) errors.push('Name is required');
  if (!device.latitude || device.latitude < -90 || device.latitude > 90) errors.push('Valid latitude required');
  if (!device.longitude || device.longitude < -180 || device.longitude > 180) errors.push('Valid longitude required');
  
  if (device.type === 'olt') {
    const olt = device as OltDevice;
    if (olt.capacity < 1) errors.push('Capacity must be positive');
    if (olt.usedPorts > olt.capacity) errors.push('Used ports cannot exceed capacity');
  }
  
  if (device.type === 'onu') {
    const onu = device as OnuDevice;
    if (onu.rxPower > -5 || onu.rxPower < -30) errors.push('Rx power must be between -30 and -5 dBm');
    if (onu.txPower < 0 || onu.txPower > 5) errors.push('Tx power must be between 0 and 5 dBm');
  }
  
  return errors;
};

/**
 * Generate unique ID
 */
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};