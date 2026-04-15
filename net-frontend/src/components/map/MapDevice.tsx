"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import {
  FiMapPin, FiRefreshCw, FiWifi, FiWifiOff, FiSave, FiEdit2,
  FiUsers, FiSearch, FiX, FiChevronRight, FiChevronLeft,
  FiRadio, FiServer, FiFilter, FiCheck, FiAlertCircle,
  FiLayers, FiSliders, FiCpu, FiGitCommit, FiShare2, FiHome, FiTrash2,
} from "react-icons/fi";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { Customer, CustomerApi } from "@/lib/api/customer";
import { OpticalApi } from "@/lib/api/genieacs";
import type { ODPSummary, GenieACSDevice, FiberCable, OpticalDevice } from "@/types/optical.types";
import { useOpticalSelectionStore } from "@/store/opticalSelectionStore";
import { PPPoEApi } from "@/lib/api/pppoe";
import { useAuth } from "@/context/AuthContext";
import { SweetAlert } from "@/lib/sweetalert";
import type * as Leaflet from "leaflet";

const DEFAULT_CENTER: [number, number] = [-7.5463, 112.2364];

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    up:      "bg-green-100 text-green-700",
    down:    "bg-red-100 text-red-700",
    pinging: "bg-blue-100 text-blue-700",
    unknown: "bg-gray-100 text-gray-600",
  };
  return map[status] ?? map.unknown;
}

function routerColor(status: string) {
  const map: Record<string, string> = {
    up: "#10b981", down: "#ef4444", pinging: "#3b82f6",
  };
  return map[status] ?? "#6b7280";
}

const CUSTOMER_COLORS: Record<string, string> = {
  PPPOE: "#8b5cf6", DHCP: "#f59e0b", STATIC: "#06b6d4",
};

function customerColor(c: Customer) {
  if (!c.is_active) return "#9ca3af";
  return CUSTOMER_COLORS[c.type] ?? "#6b7280";
}

// ─── Map sub-components ──────────────────────────────────────────────────────

function MapClickHandler({ onMapClick, editing }: { onMapClick: (lat: number, lng: number) => void; editing: boolean }) {
  useMapEvents({ click: (e: any) => { if (editing) onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function MapInteractionHandler({
  mode, onOntPin,
}: {
  mode: "pin-ont" | null;
  onOntPin: (latlng: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode === "pin-ont") onOntPin([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function AutoFitBounds({ devices, enabled }: { devices: MikrotikRouter[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !map) return;
    const pts = devices.filter(d => d.latitude && d.longitude);
    if (pts.length === 0) return;
    map.fitBounds(pts.map(d => [d.latitude!, d.longitude!]) as [number, number][], { padding: [50, 50], maxZoom: 15, animate: true });
  }, [devices, enabled, map]);
  return null;
}

// ─── Markers ─────────────────────────────────────────────────────────────────

function DeviceMarker({ device, onSelect, L, isSelected, onCableSelect }: {
  device: MikrotikRouter;
  onSelect: (d: MikrotikRouter) => void;
  L: any;
  isSelected: boolean;
  onCableSelect?: (pos: [number,number], id: number, name: string) => void;
}) {
  const pos: [number, number] = [device.latitude || DEFAULT_CENTER[0], device.longitude || DEFAULT_CENTER[1]];
  const size   = isSelected ? 40 : 30;
  const color  = routerColor(device.status);
  const selected = isSelected;
  const icon = L?.divIcon({
    html: `<div class="${device.status === 'up' ? 'marker-online' : ''}" style="
  width:${size}px;height:${size}px;
  border-radius:50%;
  background:${color};
  border:${selected?'3px':'2px'} solid white;
  box-shadow:0 2px 8px rgba(0,0,0,0.35)${selected?',0 0 0 3px '+color+'60':''};
  display:flex;align-items:center;justify-content:center;
  position:relative;
  --mr:${device.status==='up'?'16,185,129':device.status==='pinging'?'59,130,246':'107,114,128'};
">
  <svg width="${Math.round(size*0.55)}" height="${Math.round(size*0.55)}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="8" width="20" height="8" rx="2" fill="white" fill-opacity="0.9"/>
    <circle cx="6" cy="12" r="1.5" fill="${color}"/>
    <circle cx="10" cy="12" r="1.5" fill="${color}"/>
    <line x1="12" y1="8" x2="12" y2="5" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="10" y1="5" x2="14" y2="5" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="8" y1="3" x2="16" y2="3" stroke="white" stroke-width="1.5" stroke-opacity="0.7"/>
  </svg>
</div>`,
    className: "custom-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
  if (!L || !icon) return null;
  return (
    <Marker position={pos} icon={icon} eventHandlers={{ click: () => {
      if (onCableSelect) { onCableSelect([pos[0], pos[1]], device.id, device.name); return; }
      onSelect(device);
    }}}>
      <Popup minWidth={220}>
        <div className="text-xs p-1 space-y-2 min-w-[200px]">
          <div className="flex items-center gap-2">
            <div style={{ width:10, height:10, borderRadius:"50%", background: routerColor(device.status) }} />
            <span className="font-bold text-sm text-gray-900">{device.name}</span>
          </div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
            device.status==="up" ? "bg-green-100 text-green-700" :
            device.status==="down" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
          }`}>{device.status}</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
            <span className="text-gray-400">Host</span>
            <span className="font-mono text-[11px]">{device.host}:{device.port}</span>
            <span className="text-gray-400">User</span><span>{device.username}</span>
            <span className="text-gray-400">Aktif</span>
            <span className={device.is_active ? "text-green-600" : "text-red-500"}>{device.is_active ? "Ya" : "Tidak"}</span>
            {device.latitude != null && device.longitude != null && (
              <>
                <span className="text-gray-400">Lokasi</span>
                <span className="font-mono text-[10px]">{device.latitude.toFixed(5)}, {device.longitude.toFixed(5)}</span>
              </>
            )}
          </div>
          {device.created_at && (
            <p className="text-[10px] text-gray-400 border-t pt-1">
              Ditambahkan {new Date(device.created_at).toLocaleDateString("id-ID")}
            </p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

function CustomerMarker({ customer, onDragEnd, L, isSelected, canEdit }: { customer: Customer; onDragEnd: (id: number, lat: number, lng: number) => void; L: any; isSelected: boolean; canEdit: boolean }) {
  const pos: [number, number] = [customer.latitude!, customer.longitude!];
  const color  = customerColor(customer);
  const size   = 22;
  const selected = isSelected;
  const icon = L?.divIcon({
    html: `<div style="
  width:${size}px;height:${size}px;
  background:${color};
  border-radius:4px;
  border:${selected?'3px':'2px'} solid white;
  box-shadow:0 2px 6px rgba(0,0,0,0.3);
  display:flex;align-items:center;justify-content:center;
">
  <svg width="${Math.round(size*0.6)}" height="${Math.round(size*0.6)}" viewBox="0 0 24 24" fill="none">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fill="white" fill-opacity="0.9"/>
    <rect x="9" y="13" width="6" height="8" rx="1" fill="${color}"/>
  </svg>
</div>`,
    className: "customer-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
  if (!L || !icon) return null;
  return (
    <Marker position={pos} icon={icon} draggable={canEdit}
      eventHandlers={{ dragend: (e: any) => { const { lat, lng } = e.target.getLatLng(); onDragEnd(customer.id, lat, lng); } }}
    >
      <Popup minWidth={200}>
        <div className="text-xs p-1 space-y-1.5 min-w-[180px]">
          <div>
            <p className="font-bold text-gray-900 text-sm">{customer.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span style={{ background: customerColor(customer) }} className="text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">{customer.type}</span>
              <span className={customer.is_active ? "text-green-600" : "text-red-400"}>{customer.is_active ? "Aktif" : "Nonaktif"}</span>
            </div>
          </div>
          <div className="space-y-0.5 text-gray-600">
            {customer.address && <p><span className="text-gray-400">Alamat: </span>{customer.address}</p>}
            {customer.package_name && <p><span className="text-gray-400">Paket: </span><span className="font-medium text-indigo-600">{customer.package_name}</span></p>}
            {customer.wa_number && <p><span className="text-gray-400">WA: </span>{customer.wa_number}</p>}
            {customer.note && <p className="italic text-gray-400">{customer.note}</p>}
            {customer.mikrotik_ref && <p><span className="text-gray-400">Ref: </span><span className="font-mono text-[11px]">{customer.mikrotik_ref}</span></p>}
          </div>
          {customer.created_at && (
            <p className="text-[10px] text-gray-400 border-t pt-1">Didaftarkan {new Date(customer.created_at).toLocaleDateString("id-ID")}</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

function CustomerLink({ customer, router, waypoint, onWaypointDrag, onWaypointReset, L, canEdit }: {
  customer: Customer; router: MikrotikRouter; waypoint: [number,number]|null;
  onWaypointDrag: (id: number, lat: number, lng: number) => void;
  onWaypointReset: (id: number) => void; L: any; canEdit: boolean;
}) {
  const cPos: [number,number] = [customer.latitude!, customer.longitude!];
  const rPos: [number,number] = [router.latitude!, router.longitude!];
  const midpoint: [number,number] = waypoint ?? [(cPos[0]+rPos[0])/2, (cPos[1]+rPos[1])/2];
  const positions: [number,number][] = waypoint ? [cPos, waypoint, rPos] : [cPos, rPos];
  const isAlert = router.status === "down" || router.status === "pinging";
  const color = isAlert ? "#ef4444" : customerColor(customer);
  const handleIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      html: `<div style="width:10px;height:10px;background:white;border:2px solid ${color};border-radius:50%;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      className: "cable-handle", iconSize: [10,10], iconAnchor: [5,5],
    });
  }, [L, color]);

  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: isAlert ? 2.5 : 2, dashArray: "12,6", opacity: 0.8 }} />
      {canEdit && L && handleIcon && (
        <Marker position={midpoint} icon={handleIcon} draggable
          eventHandlers={{
            dragend: (e: any) => { const { lat, lng } = e.target.getLatLng(); onWaypointDrag(customer.id, lat, lng); },
            dblclick: () => onWaypointReset(customer.id),
          }}
        >
          <Popup minWidth={140}>
            <div className="text-xs text-center p-1">
              <p className="font-medium text-gray-700">Titik kabel</p>
              <p className="text-gray-400">Drag untuk membelokkan · Dbl-click reset</p>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}

// ─── GenieACS helpers ────────────────────────────────────────────────────────

function acsIsOnline(lastInform?: string): boolean {
  if (!lastInform) return false;
  return Date.now() - new Date(lastInform).getTime() < 15 * 60 * 1000;
}

function acsSerial(device: GenieACSDevice): string {
  const did = device._deviceId as Record<string, string | undefined> | undefined;
  return did?._SerialNumber ?? "-";
}

function acsManufacturer(device: GenieACSDevice): string {
  const m = (device._deviceId as any)?._Manufacturer ?? "";
  if (!m) return "-";
  const l = m.toLowerCase();
  if (l.includes("huawei")) return "Huawei";
  if (l.includes("zte")) return "ZTE";
  if (l.includes("fiberhome") || l.includes("fiber home")) return "FiberHome";
  return m.split(/[\s,]/)[0];
}

function acsDetectType(device: GenieACSDevice): "olt" | "odp" | "onu" {
  const pc = (device._deviceId?._ProductClass ?? "").toLowerCase();
  const mfr = (device._deviceId?._Manufacturer ?? "").toLowerCase();
  const combined = `${mfr} ${pc}`;
  if (/\bolt\b|c300|c600|c320|ma5800|ma5600/.test(combined)) return "olt";
  if (/\bodp\b|optical.*distrib|passive.*distrib/.test(combined)) return "odp";
  return "onu";
}

function acsLeafStr(node: unknown, ...parts: string[]): string {
  let cur: unknown = node;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return "-";
    cur = (cur as Record<string, unknown>)[p];
  }
  if (!cur || typeof cur !== "object") return "-";
  const v = (cur as Record<string, unknown>)["_value"];
  return v === null || v === undefined || v === "" ? "-" : String(v);
}

function acsIP(device: GenieACSDevice): string {
  const v1 = acsLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANIPConnection", "1", "ExternalIPAddress");
  if (v1 !== "-") return v1;
  return acsLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANPPPConnection", "1", "ExternalIPAddress");
}

function acsMAC(device: GenieACSDevice): string {
  return acsLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANCommonInterfaceConfig", "MACAddress");
}

function acsSSID(device: GenieACSDevice): string {
  return acsLeafStr(device, "InternetGatewayDevice", "LANDevice", "1", "WLANConfiguration", "1", "SSID");
}

function acsPPPoE(device: GenieACSDevice): string {
  return acsLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANPPPConnection", "1", "Username");
}

function acsTemp(device: GenieACSDevice): number | null {
  function getNum(node: unknown, ...parts: string[]): number | null {
    let cur: unknown = node;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[p];
    }
    if (!cur || typeof cur !== "object") return null;
    const raw = (cur as Record<string, unknown>)["_value"];
    if (raw === null || raw === undefined) return null;
    const n = Number(raw); return isNaN(n) ? null : n;
  }
  return getNum(device, "InternetGatewayDevice", "DeviceInfo", "X_HW_Temperature")
    ?? getNum(device, "InternetGatewayDevice", "X_ZTE_COM_TempInfo", "Temperature");
}

function acsClientCount(device: GenieACSDevice): number {
  try {
    const hostTable = (device as any)?.InternetGatewayDevice?.LANDevice?.["1"]?.Hosts?.Host;
    if (!hostTable || typeof hostTable !== "object") return 0;
    return Object.keys(hostTable).filter(k => !k.startsWith("_")).length;
  } catch { return 0; }
}

function acsSignalAtt(device: GenieACSDevice): number | null {
  const RX_PATHS = [
    ["InternetGatewayDevice", "X_ZTE_COM_GponParm", "RxOpticalPower"],
    ["InternetGatewayDevice", "WANDevice", "1", "X_HW_GPON", "RxPower"],
  ];
  const TX_PATHS = [
    ["InternetGatewayDevice", "X_ZTE_COM_GponParm", "TxOpticalPower"],
    ["InternetGatewayDevice", "WANDevice", "1", "X_HW_GPON", "TxPower"],
  ];
  function getVal(paths: string[][]): number | null {
    for (const path of paths) {
      let cur: unknown = device;
      for (const p of path) {
        if (!cur || typeof cur !== "object") { cur = null; break; }
        cur = (cur as Record<string, unknown>)[p];
      }
      if (cur && typeof cur === "object") {
        const raw = (cur as Record<string, unknown>)["_value"];
        if (raw !== null && raw !== undefined) {
          const n = Number(raw);
          if (!isNaN(n)) return Math.abs(n) > 100 ? n / 1000 : n;
        }
      }
    }
    return null;
  }
  const rx = getVal(RX_PATHS);
  const tx = getVal(TX_PATHS);
  return rx !== null && tx !== null ? tx - rx : null;
}

function ODPMarker({ odp, router, L, isSelected, onSelect, onCableSelect }: {
  odp: ODPSummary;
  router?: MikrotikRouter;
  L: any;
  isSelected: boolean;
  onSelect: (odp: ODPSummary) => void;
  onCableSelect?: (pos: [number,number], id: number, name: string) => void;
}) {
  const pos: [number,number] = [odp.latitude!, odp.longitude!];
  const bg = !odp.is_active ? "#6b7280" : odp.fault_suspected ? "#ef4444" : odp.down_onus > 0 ? "#f59e0b" : "#10b981";
  const size = isSelected ? 32 : 22;
  const isHealthy = odp.is_active && !odp.fault_suspected && odp.down_onus === 0;
  const odpHtml = `<div style="
  width:${size}px;height:${size}px;
  position:relative;
  display:flex;align-items:center;justify-content:center;
">
  <div class="${isHealthy ? 'marker-online' : ''}" style="
    width:${size}px;height:${size}px;
    --mr:${isHealthy ? '16,185,129' : odp.fault_suspected ? '239,68,68' : '107,114,128'};
    background:${bg};
    border:${isSelected?'3px':'2px'} solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.4)${isSelected?',0 0 0 3px #f59e0b80':''};
    transform:rotate(45deg);
    border-radius:3px;
    position:absolute;
  "></div>
  <svg width="${Math.round(size*0.6)}" height="${Math.round(size*0.6)}" viewBox="0 0 24 24" fill="none" style="position:relative;z-index:1">
    <circle cx="12" cy="12" r="3" fill="white" fill-opacity="0.95"/>
    <line x1="12" y1="9" x2="12" y2="4" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="15" y1="10.5" x2="19" y2="7" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="15" y1="13.5" x2="19" y2="17" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="12" y1="15" x2="12" y2="20" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="9" y1="10.5" x2="5" y2="7" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
    <line x1="9" y1="13.5" x2="5" y2="17" stroke="white" stroke-width="1.5" stroke-opacity="0.9"/>
  </svg>
</div>`;
  const icon = L?.divIcon({
    html: odpHtml,
    className: "odp-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
  if (!L || !icon) return null;
  return (
    <>
      {router?.latitude && router?.longitude && (
        <Polyline
          key={`odp-${odp.id}-router`}
          positions={[[odp.latitude!, odp.longitude!],[router.latitude!, router.longitude!]]}
          pathOptions={{ color: bg, weight: 1.5, dashArray: "6,8", opacity: 0.5 }}
        />
      )}
      <Marker position={pos} icon={icon} eventHandlers={{ click: () => {
        if (onCableSelect && odp.latitude != null && odp.longitude != null) {
          onCableSelect([odp.latitude, odp.longitude], odp.id, odp.name);
          return;
        }
        onSelect(odp);
      }}}>
        <Popup minWidth={230}>
          <div className="text-xs p-1 space-y-2 min-w-[210px]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-gray-900">{odp.name}</span>
              <span style={{ background: bg }} className="text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">
                {!odp.is_active ? "Nonaktif" : odp.fault_suspected ? "Fault" : odp.down_onus > 0 ? "Gangguan" : "Normal"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1 bg-gray-50 rounded p-1.5 text-center">
                <p className="text-base font-bold text-gray-800">{odp.total_onus}</p>
                <p className="text-[10px] text-gray-400">Total ONU</p>
              </div>
              <div className="flex-1 bg-red-50 rounded p-1.5 text-center">
                <p className="text-base font-bold text-red-600">{odp.down_onus}</p>
                <p className="text-[10px] text-red-400">Down</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded p-1.5 text-center">
                <p className="text-base font-bold text-amber-600">{odp.degraded_onus}</p>
                <p className="text-[10px] text-amber-400">Degraded</p>
              </div>
            </div>
            {odp.total_ports != null && (
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                  <span>Port</span><span>{odp.used_ports ?? 0}/{odp.total_ports} terpakai</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div style={{ width: `${Math.min(100,((odp.used_ports??0)/odp.total_ports)*100)}%` }}
                    className="h-full bg-indigo-500 rounded-full" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
              {odp.ip_address && <><span className="text-gray-400">IP</span><span className="font-mono text-[11px]">{odp.ip_address}</span></>}
              {odp.vendor && <><span className="text-gray-400">Vendor</span><span className="capitalize">{odp.vendor}</span></>}
              {odp.serial && <><span className="text-gray-400">Serial</span><span className="font-mono text-[11px]">{odp.serial}</span></>}
              {router && <><span className="text-gray-400">OLT</span><span>{router.name}</span></>}
              {odp.latest_status?.rx_power != null && (
                <><span className="text-gray-400">RX Power</span>
                <span className={odp.latest_status.rx_power < -25 ? "text-red-500" : "text-gray-700"}>
                  {odp.latest_status.rx_power.toFixed(1)} dBm
                </span></>
              )}
            </div>
            {odp.photo_url && <img src={odp.photo_url} alt={odp.name} className="w-full h-20 object-cover rounded" />}
          </div>
        </Popup>
      </Marker>
    </>
  );
}

// ─── Map layer config ─────────────────────────────────────────────────────────

const MAP_LAYERS = {
  satellite: { name: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: '&copy; Esri' },
  street:    { name: "Street",    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                                           attribution: '&copy; OpenStreetMap contributors' },
  terrain:   { name: "Terrain",   url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",                                             attribution: '&copy; OpenTopoMap' },
  dark:      { name: "Dark",      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",                                attribution: '&copy; CARTO' },
};

type SidebarTab = "devices" | "customers" | "odp" | "ont";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MapDevice() {
  const { user } = useAuth();

  // Data
  const [devices,  setDevices]  = useState<MikrotikRouter[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [odps,       setOdps]       = useState<ODPSummary[]>([]);
  const [acsDevices, setAcsDevices] = useState<GenieACSDevice[]>([]);
  const [acsSearch,  setAcsSearch]  = useState("");
  const [acsStatus,  setAcsStatus]  = useState<"all" | "online" | "offline">("all");
  const [pppoeComments, setPppoeComments] = useState<Record<string, string>>({});

  // ONT pin
  const [pinningOnt, setPinningOnt] = useState<GenieACSDevice | null>(null);
  const [pinnedOnts, setPinnedOnts] = useState<OpticalDevice[]>([]);

  // Fiber cables
  const [cables, setCables] = useState<FiberCable[]>([]);
  const [cableDrawMode, setCableDrawMode] = useState<"idle" | "selecting-from" | "selecting-to">("idle");
  const [cableFromDevice, setCableFromDevice] = useState<{ id: number; pos: [number,number]; name: string } | null>(null);
  const [cableToDevice, setCableToDevice]   = useState<{ id: number; pos: [number,number]; name: string } | null>(null);
  const [cableForm, setCableForm] = useState<{ name: string; color: string; cable_type: 'fiber'|'drop'|'trunk' } | null>(null);
  const [showCables, setShowCables] = useState(true);
  const [loading,  setLoading]  = useState(true);

  // Map
  const [L,            setL]            = useState<typeof Leaflet | null>(null);
  const [mapReady,     setMapReady]     = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<keyof typeof MAP_LAYERS>("satellite");
  const [showCustomers, setShowCustomers] = useState(true);
  const [showOdps,      setShowOdps]      = useState(true);
  const [autoFit,       setAutoFit]       = useState(true);
  const [cableWaypoints, setCableWaypoints] = useState<Record<number,[number,number]>>({});

  // Selection / edit
  const [selectedDevice,   setSelectedDevice]   = useState<MikrotikRouter | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editMode,         setEditMode]         = useState<"router" | "customer" | null>(null);
  const [tempLocation,     setTempLocation]     = useState<[number,number] | null>(null);
  const [saving,           setSaving]           = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab,   setActiveTab]   = useState<SidebarTab>("devices");

  // Sidebar search + filter
  const [deviceSearch,  setDeviceSearch]  = useState("");
  const [deviceStatus,  setDeviceStatus]  = useState<"all"|"up"|"down"|"pinging"|"unknown">("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerType,   setCustomerType]   = useState<"all"|"PPPOE"|"DHCP"|"STATIC">("all");
  const [customerActive, setCustomerActive] = useState<"all"|"active"|"inactive">("all");
  const [odpSearch,  setOdpSearch]  = useState("");
  const [odpStatus,  setOdpStatus]  = useState<"all"|"normal"|"fault"|"inactive">("all");

  // ── Leaflet init ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then(leaflet => {
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      setL(leaflet);
      setMapReady(true);
    });
  }, []);

  // ── Escape key (fixed with ref) ──
  const cableDrawModeRef = useRef(cableDrawMode);
  useEffect(() => {
    cableDrawModeRef.current = cableDrawMode;
  }, [cableDrawMode]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEditMode(null);
      setTempLocation(null);
      setPinningOnt(null);
      if (cableDrawModeRef.current !== "idle") {
        setCableDrawMode("idle");
        setCableFromDevice(null);
        setCableToDevice(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // ── Data fetching (with isMounted pattern) ──
  const fetchDevices = useCallback(async () => {
    try {
      const data = await MikrotikApi.findAll();
      setDevices(data);
    } catch {
      SweetAlert.error("Error", "Gagal memuat data device");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const data = await CustomerApi.getAll();
      setCustomers(data);
    } catch {
      SweetAlert.error("Error", "Gagal memuat data pelanggan");
    }
  }, []);

  const fetchOdps = useCallback(async () => {
    try {
      const data = await OpticalApi.listODP();
      setOdps(data);
    } catch {
      SweetAlert.error("Error", "Gagal memuat data ODP");
    }
  }, []);

  const fetchAcsDevices = useCallback(async () => {
    try {
      const data = await OpticalApi.listGenieACSDevices();
      setAcsDevices(data);
    } catch {
      SweetAlert.error("Error", "Gagal memuat data perangkat GenieACS");
    }
  }, []);

  const fetchPinnedOnts = useCallback(async () => {
    try {
      const all = await OpticalApi.listONU();
      setPinnedOnts(all.filter(d => d.latitude != null && d.longitude != null));
    } catch {
      SweetAlert.error("Error", "Gagal memuat data ONU terpin");
    }
  }, []);

  const fetchCables = useCallback(async () => {
    try {
      const data = await OpticalApi.listCables();
      setCables(data);
    } catch {
      SweetAlert.error("Error", "Gagal memuat data kabel");
    }
  }, []);

  const fetchPppoeComments = useCallback(async (routers: MikrotikRouter[]) => {
    const active = routers.filter(r => r.is_active);
    if (!active.length) return;
    try {
      const results = await Promise.allSettled(active.map(r => PPPoEApi.findAll(r.id)));
      const lookup: Record<string, string> = {};
      results.forEach(res => { if (res.status === "fulfilled") res.value.forEach(s => { if (s.comment) lookup[s.name] = s.comment; }); });
      setPppoeComments(lookup);
    } catch {
      // ignore
    }
  }, []);

  // Mount data
  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      if (!isMounted) return;
      await Promise.all([
        fetchDevices(),
        fetchCustomers(),
        fetchOdps(),
        fetchAcsDevices(),
        fetchPinnedOnts(),
        fetchCables(),
      ]);
    };
    fetchAll();
    return () => { isMounted = false; };
  }, [fetchDevices, fetchCustomers, fetchOdps, fetchAcsDevices, fetchPinnedOnts, fetchCables]);

  useEffect(() => {
    if (devices.length > 0) fetchPppoeComments(devices);
  }, [devices, fetchPppoeComments]);

  // ── Optical selection store ──
  const { selectedODP, setSelectedODP, selectedDevice: selectedAcsDevice, setSelectedDevice: setSelectedAcsDevice } = useOpticalSelectionStore();
  const odpItemRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Auto-switch to ODP tab when selectedODP is set
  useEffect(() => {
    if (!selectedODP) return;
    setActiveTab('odp');
    setSidebarOpen(true);
    const timer = setTimeout(() => {
      odpItemRefs.current.get(selectedODP.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedODP]);

  // Auto-switch to ONT tab when selectedAcsDevice is set
  useEffect(() => {
    if (!selectedAcsDevice) return;
    setActiveTab('ont');
    setSidebarOpen(true);
  }, [selectedAcsDevice]);

  // ── Filtered lists for sidebar tables ──
  const filteredDevices = useMemo(() => devices.filter(d => {
    const q = deviceSearch.toLowerCase();
    return (q === "" || d.name.toLowerCase().includes(q) || d.host.toLowerCase().includes(q))
      && (deviceStatus === "all" || d.status === deviceStatus);
  }), [devices, deviceSearch, deviceStatus]);

  const filteredCustomers = useMemo(() => customers.filter(c => {
    const q = customerSearch.toLowerCase();
    const comment = c.mikrotik_ref ? pppoeComments[c.mikrotik_ref] ?? "" : "";
    return (q === "" || c.name.toLowerCase().includes(q) || (c.address ?? "").toLowerCase().includes(q) || comment.toLowerCase().includes(q))
      && (customerType   === "all"      || c.type      === customerType)
      && (customerActive === "all"      || (customerActive === "active" ? c.is_active : !c.is_active));
  }), [customers, customerSearch, customerType, customerActive, pppoeComments]);

  const filteredOdps = useMemo(() => odps.filter(o => {
    const q = odpSearch.toLowerCase();
    const statusMatch = odpStatus === "all"
      ? true
      : odpStatus === "inactive" ? !o.is_active
      : odpStatus === "fault"    ? o.is_active && o.fault_suspected
      : o.is_active && !o.fault_suspected;
    return (q === "" || o.name.toLowerCase().includes(q)) && statusMatch;
  }), [odps, odpSearch, odpStatus]);

  const filteredAcs = useMemo(() => acsDevices.filter(d => {
    if (acsDetectType(d) === "odp") return false;
    const q = acsSearch.toLowerCase();
    const online = acsIsOnline(d._lastInform);
    const statusMatch = acsStatus === "all" ? true : acsStatus === "online" ? online : !online;
    if (!statusMatch) return false;
    if (q === "") return true;
    return acsSerial(d).toLowerCase().includes(q)
      || acsManufacturer(d).toLowerCase().includes(q)
      || acsIP(d).toLowerCase().includes(q)
      || acsPPPoE(d).toLowerCase().includes(q)
      || acsSSID(d).toLowerCase().includes(q);
  }), [acsDevices, acsSearch, acsStatus]);

  // ── Filtered devices for map markers (uses device search + status) ──
  const mapDevices = useMemo(() => devices.filter(d => {
    const q = deviceSearch.toLowerCase();
    return (q === "" || d.name.toLowerCase().includes(q))
      && (deviceStatus === "all" || d.status === deviceStatus);
  }), [devices, deviceSearch, deviceStatus]);

  const mapCustomers = useMemo(() => {
    if (!showCustomers) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.latitude && c.longitude &&
      (q === "" || c.name.toLowerCase().includes(q) || (c.address ?? "").toLowerCase().includes(q))
    );
  }, [customers, showCustomers, customerSearch]);

  // ── isConnected (fixed) ──
  const isConnected = useCallback((c: FiberCable): boolean => {
    if (!c.from_device_id && !c.to_device_id) return true;
    const checkStatus = (id: number) => {
      const router = devices.find(d => d.id === id);
      if (router) return router.status === "up";
      const odp = odps.find(o => o.id === id);
      if (odp) return odp.is_active && !odp.fault_suspected;
      const ont = pinnedOnts.find(o => o.id === id);
      if (ont) return ont.latest_status?.link_status === "up";
      return false;
    };
    if (c.from_device_id && !c.to_device_id) return checkStatus(c.from_device_id);
    if (!c.from_device_id && c.to_device_id) return checkStatus(c.to_device_id);
    return checkStatus(c.from_device_id!) && checkStatus(c.to_device_id!);
  }, [devices, odps, pinnedOnts]);

  // ── Event handlers ──
  const handleSelectDevice = (device: MikrotikRouter) => {
    setSelectedDevice(device);
    setSelectedCustomer(null);
    setTempLocation(null);
    setEditMode(null);
  };

  const handleSaveLocation = async () => {
    if (!tempLocation) return;
    setSaving(true);
    try {
      if (editMode === "router" && selectedDevice) {
        await MikrotikApi.updateCoordinates(selectedDevice.id, tempLocation[0], tempLocation[1]);
        SweetAlert.success("Berhasil", "Koordinat device diperbarui");
        await fetchDevices();
        setSelectedDevice(prev => prev ? { ...prev, latitude: tempLocation[0], longitude: tempLocation[1] } : null);
      } else if (editMode === "customer" && selectedCustomer) {
        await CustomerApi.updateCoordinates(selectedCustomer.id, tempLocation[0], tempLocation[1]);
        SweetAlert.success("Berhasil", "Koordinat pelanggan diperbarui");
        await fetchCustomers();
      }
      setTempLocation(null);
      setEditMode(null);
    } catch {
      SweetAlert.error("Error", "Gagal memperbarui koordinat");
    } finally {
      setSaving(false);
    }
  };

  const handleCustomerDragEnd = useCallback(async (id: number, lat: number, lng: number) => {
    try {
      await CustomerApi.updateCoordinates(id, lat, lng);
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, latitude: lat, longitude: lng } : c));
    } catch {
      SweetAlert.error("Error", "Gagal menyimpan lokasi");
      await fetchCustomers();
    }
  }, [fetchCustomers]);

  const handleOntPin = useCallback(async (latlng: [number,number]) => {
    if (!pinningOnt) return;
    try {
      const all = await OpticalApi.listONU();
      const match = all.find(d => d.genieacs_id === pinningOnt._id);
      if (match) {
        await OpticalApi.updateONU(match.id, { latitude: latlng[0], longitude: latlng[1] });
      } else {
        const serial = acsSerial(pinningOnt);
        const imported = await OpticalApi.importGenieACSDevice(pinningOnt._id, {
          device_type: "onu",
          name: serial !== "-" ? serial : pinningOnt._id.split("-").pop() || pinningOnt._id,
        });
        await OpticalApi.updateONU(imported.id, { latitude: latlng[0], longitude: latlng[1] });
      }
      await fetchPinnedOnts();
      await fetchAcsDevices();
      setPinningOnt(null);
    } catch (e) {
      console.error("pin ONT failed", e);
      SweetAlert.error("Gagal", "Gagal menyimpan lokasi ONT. Silakan coba lagi.");
      setPinningOnt(null);
    }
  }, [pinningOnt, fetchPinnedOnts, fetchAcsDevices]);

  const handleCableSelect = useCallback((pos: [number,number], id: number, name: string) => {
    if (cableDrawMode === "selecting-from") {
      setCableFromDevice({ id, pos, name });
      setCableDrawMode("selecting-to");
    } else if (cableDrawMode === "selecting-to" && cableFromDevice) {
      if (cableFromDevice.id === id) {
        SweetAlert.warning("Peringatan", "Tidak dapat membuat kabel ke perangkat yang sama.");
        return;
      }
      setCableToDevice({ id, pos, name });
      setCableForm({ name: `${cableFromDevice.name} → ${name}`, color: "#f97316", cable_type: "fiber" });
      setCableDrawMode("idle");
    }
  }, [cableDrawMode, cableFromDevice]);

  const handleSaveCable = useCallback(async () => {
    if (!cableForm || !cableFromDevice || !cableToDevice) return;
    try {
      await OpticalApi.createCable({
        name: cableForm.name || `Kabel ${cableFromDevice.name} → ${cableToDevice.name}`,
        points: [cableFromDevice.pos, cableToDevice.pos],
        cable_type: cableForm.cable_type,
        color: cableForm.color,
        from_device_id: cableFromDevice.id,
        to_device_id: cableToDevice.id,
        notes: "",
      });
      await fetchCables();
      setCableForm(null);
      setCableFromDevice(null);
      setCableToDevice(null);
    } catch (e) {
      console.error("save cable failed", e);
      SweetAlert.error("Error", "Gagal menyimpan kabel");
    }
  }, [cableForm, cableFromDevice, cableToDevice, fetchCables]);

  const canEdit  = user?.role === "mitra" || user?.role === "superadmin";
  const isEditing = editMode !== null;

  const statusCounts = useMemo(() => ({
    up:      devices.filter(d => d.status === "up").length,
    down:    devices.filter(d => d.status === "down").length,
    pinging: devices.filter(d => d.status === "pinging").length,
  }), [devices]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Map (full area) ── */}
      <div className="absolute inset-0">
        {!mapReady || loading ? (
          <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500" />
          </div>
        ) : (
          <MapContainer center={DEFAULT_CENTER} zoom={10} style={{ height: "100%", width: "100%" }} className="z-0">
            <TileLayer attribution={MAP_LAYERS[selectedLayer].attribution} url={MAP_LAYERS[selectedLayer].url} />
            {isEditing && <MapClickHandler onMapClick={(lat, lng) => setTempLocation([lat, lng])} editing={isEditing} />}
            <MapInteractionHandler
              mode={pinningOnt ? "pin-ont" : null}
              onOntPin={handleOntPin}
            />
            {autoFit && <AutoFitBounds devices={mapDevices} enabled={mapReady} />}

            {/* Customer links */}
            {mapCustomers.filter(c => c.router_id).map(c => {
              const router = devices.find(d => d.id === c.router_id);
              if (!router?.latitude || !router?.longitude) return null;
              return (
                <CustomerLink key={`link-${c.id}`} customer={c} router={router}
                  waypoint={cableWaypoints[c.id] ?? null}
                  onWaypointDrag={(id, lat, lng) => setCableWaypoints(prev => ({ ...prev, [id]: [lat, lng] }))}
                  onWaypointReset={id => setCableWaypoints(prev => { const n = { ...prev }; delete n[id]; return n; })}
                  L={L} canEdit={canEdit} />
              );
            })}

            {/* Customer markers */}
            {mapCustomers.map(c => (
              <CustomerMarker key={`c-${c.id}`} customer={c}
                onDragEnd={handleCustomerDragEnd} L={L}
                isSelected={selectedCustomer?.id === c.id} canEdit={canEdit} />
            ))}

            {/* ODP markers */}
            {showOdps && odps.filter(o => o.latitude && o.longitude).map(o => (
              <ODPMarker
                key={`odp-${o.id}`}
                odp={o}
                router={o.mikrotik_id ? devices.find(d => d.id === o.mikrotik_id) : undefined}
                L={L}
                isSelected={selectedODP?.id === o.id}
                onSelect={(odp) => {
                  setSelectedODP(odp);
                  setActiveTab('odp');
                  setSidebarOpen(true);
                }}
                onCableSelect={cableDrawMode !== "idle" ? handleCableSelect : undefined}
              />
            ))}

            {/* ONT/ONU markers (pinned) */}
            {L && pinnedOnts.map(ont => {
              const online = ont.latest_status?.link_status === "up";
              const ontBg = online ? "#6366f1" : "#94a3b8";
              const ontSize = 22;
              const ontIcon = L.divIcon({
                className: "",
                iconSize: [ontSize, ontSize],
                iconAnchor: [ontSize/2, ontSize/2],
                html: `<div style="width:${ontSize}px;height:${ontSize}px;display:flex;align-items:center;justify-content:center;">
    <div class="${online ? 'marker-online' : ''}" style="
      width:${ontSize}px;height:${ontSize}px;
      --mr:${online ? '99,102,241' : '148,163,184'};
      border-radius:50%;
      background:${ontBg};
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M1.5 8.5C4.5 5.5 8 4 12 4s7.5 1.5 10.5 4.5" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M5 12c1.9-1.9 4.2-3 7-3s5.1 1.1 7 3" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
        <circle cx="12" cy="16" r="2" fill="white"/>
      </svg>
    </div>
  </div>`,
              });
              return (
                <Marker
                  key={`ont-${ont.id}`}
                  position={[ont.latitude!, ont.longitude!]}
                  icon={ontIcon}
                  draggable={canEdit}
                  eventHandlers={{
                    click: () => {
                      if (cableDrawMode !== "idle" && ont.latitude != null && ont.longitude != null) {
                        handleCableSelect([ont.latitude, ont.longitude], ont.id, ont.name);
                        return;
                      }
                    },
                    dragend: (e: any) => {
                      const { lat, lng } = e.target.getLatLng();
                      OpticalApi.updateONU(ont.id, { latitude: lat, longitude: lng })
                        .then(() => fetchPinnedOnts())
                        .catch(() => SweetAlert.error("Error", "Gagal menyimpan lokasi ONT"));
                    },
                  }}
                >
                  <Popup minWidth={210}>
                    <div className="text-xs p-1 space-y-2 min-w-[190px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-gray-900">{ont.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          ont.latest_status?.link_status === "up" ? "bg-green-100 text-green-700" :
                          ont.latest_status?.link_status === "degraded" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>{ont.latest_status?.link_status ?? "unknown"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                        {ont.serial && <><span className="text-gray-400">Serial</span><span className="font-mono text-[11px] truncate">{ont.serial}</span></>}
                        {ont.genieacs_id && <><span className="text-gray-400">ID</span><span className="font-mono text-[10px] truncate">{ont.genieacs_id.split("-").slice(-1)[0]}</span></>}
                        {ont.vendor && <><span className="text-gray-400">Vendor</span><span className="capitalize">{ont.vendor}</span></>}
                        {ont.ip_address && <><span className="text-gray-400">IP</span><span className="font-mono text-[11px]">{ont.ip_address}</span></>}
                        {ont.latest_status?.rx_power != null && (
                          <><span className="text-gray-400">RX</span>
                          <span className={ont.latest_status.rx_power < -25 ? "text-red-500" : "text-green-600"}>{ont.latest_status.rx_power.toFixed(1)} dBm</span></>
                        )}
                        {ont.latest_status?.tx_power != null && (
                          <><span className="text-gray-400">TX</span><span>{ont.latest_status.tx_power.toFixed(1)} dBm</span></>
                        )}
                        {ont.latest_status?.attenuation != null && (
                          <><span className="text-gray-400">Redaman</span>
                          <span className={ont.latest_status.attenuation > 25 ? "text-red-500" : "text-gray-700"}>{ont.latest_status.attenuation.toFixed(1)} dB</span></>
                        )}
                      </div>
                      {ont.latest_status?.polled_at && (
                        <p className="text-[10px] text-gray-400 border-t pt-1">Diperbarui {new Date(ont.latest_status.polled_at).toLocaleString("id-ID")}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Fiber cables */}
            {showCables && cables.map(c => (
              <Polyline
                key={`cable-${c.id}`}
                positions={c.points as [number,number][]}
                color={c.color}
                weight={3}
                opacity={0.85}
                className={isConnected(c) ? "fiber-line-connected" : "fiber-line-alert"}
              />
            ))}

            {/* Router markers */}
            {mapDevices.filter(d => d.latitude && d.longitude).map(d => (
              <DeviceMarker
                key={d.id}
                device={d}
                L={L}
                isSelected={selectedDevice?.id === d.id}
                onSelect={handleSelectDevice}
                onCableSelect={cableDrawMode !== "idle" ? handleCableSelect : undefined}
              />
            ))}

            {/* Temp pin */}
            {tempLocation && (
              <Marker position={tempLocation}>
                <Popup>
                  <div className="text-xs p-1">
                    <p className="font-semibold">Lokasi Baru</p>
                    <p className="text-gray-500">{tempLocation[0].toFixed(6)}, {tempLocation[1].toFixed(6)}</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        )}
      </div>

      {/* ── Map toolbar (floating top-left) ── */}
      <div className="absolute top-16 left-4 z-[400] bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
        {/* Layer selector */}
        <div className="px-3 py-1.5 flex items-center gap-2">
          <FiLayers className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          <select
            value={selectedLayer}
            onChange={e => setSelectedLayer(e.target.value as keyof typeof MAP_LAYERS)}
            className="text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            {Object.entries(MAP_LAYERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>

        {/* Layer toggles */}
        <div className="px-2 py-1 flex flex-col gap-0.5">
          <button
            onClick={() => setShowCustomers(!showCustomers)}
            className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded transition-colors ${showCustomers ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#8b5cf6" }} />
            Pelanggan {customers.filter(c => c.latitude && c.longitude).length > 0 && `(${customers.filter(c => c.latitude && c.longitude).length})`}
          </button>
          <button
            onClick={() => setShowOdps(!showOdps)}
            className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded transition-colors ${showOdps ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#10b981" }} />
            ODP {odps.filter(o => o.latitude && o.longitude).length > 0 && `(${odps.filter(o => o.latitude && o.longitude).length})`}
          </button>
          <button
            onClick={() => setAutoFit(!autoFit)}
            className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded transition-colors ${autoFit ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            <FiSliders className="h-3 w-3 shrink-0" />
            Auto-Fit
          </button>
          <button
            onClick={() => setCableDrawMode(m => m !== "idle" ? "idle" : "selecting-from")}
            title={cableDrawMode !== "idle" ? "Batal gambar kabel" : "Gambar kabel fiber"}
            className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded transition-colors ${
              cableDrawMode !== "idle"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <FiGitCommit className="h-3 w-3 shrink-0" />
            {cableDrawMode !== "idle" ? "Batal kabel" : "Gambar kabel"}
          </button>
          <button
            onClick={() => setShowCables(v => !v)}
            title={showCables ? "Sembunyikan kabel" : "Tampilkan kabel"}
            className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded transition-colors ${showCables ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            <FiShare2 className="h-3 w-3 shrink-0" />
            Kabel
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={() => { fetchDevices(); fetchCustomers(); fetchOdps(); fetchAcsDevices(); fetchPinnedOnts(); fetchCables(); }}
          className="px-3 py-1.5 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-b-lg"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Status summary (floating top-center of map area) ── */}
      <div
        className="absolute top-14 z-[400] -translate-x-1/2 transition-all duration-300"
        style={{ left: sidebarOpen ? "calc(50% - 192px)" : "50%" }}
      >
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full shadow-md border border-gray-200 dark:border-gray-700 px-4 py-1.5 flex items-center gap-4 text-xs">
          <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <FiServer className="h-3.5 w-3.5" /> {devices.length} Device
          </span>
          <span className="flex items-center gap-1 text-green-600"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{statusCounts.up} Up</span>
          <span className="flex items-center gap-1 text-red-600"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{statusCounts.down} Down</span>
          <span className="flex items-center gap-1 text-blue-600"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{statusCounts.pinging} Ping</span>
        </div>
      </div>

      {/* ── Sidebar toggle button ── */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-1/2 -translate-y-1/2 z-[500] bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-l-xl px-2 py-4 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
        style={{ right: sidebarOpen ? 384 : 0 }}
        title={sidebarOpen ? "Tutup panel" : "Buka panel data"}
      >
        {sidebarOpen ? <FiChevronRight className="h-4 w-4" /> : <FiChevronLeft className="h-4 w-4" />}
      </button>

      {/* ── Right Sidebar ── */}
      <div
        className={`absolute top-0 right-0 h-full w-96 z-[450] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Sidebar header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Data Jaringan</h2>
          <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-200 dark:border-gray-700">
          {([
            { id: "devices",   label: "Device",    icon: FiServer,  count: devices.length },
            { id: "customers", label: "Pelanggan", icon: FiUsers,   count: customers.length },
            { id: "odp",       label: "ODP",       icon: FiShare2,  count: odps.length },
            { id: "ont",       label: "ONT",       icon: FiWifi,    count: acsDevices.length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.id ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Tab: Devices ── */}
        {activeTab === "devices" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filters */}
            <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)}
                  placeholder="Cari nama / host..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all","up","down","pinging","unknown"] as const).map(s => (
                  <button key={s} onClick={() => setDeviceStatus(s)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${deviceStatus === s ? "bg-brand-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                    {s === "all" ? "Semua" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Nama</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Host</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Status</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredDevices.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Tidak ada data</td></tr>
                  )}
                  {filteredDevices.map(d => (
                    <tr key={d.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer ${selectedDevice?.id === d.id ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}
                      onClick={() => handleSelectDevice(d)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                            style={{ background: routerColor(d.status) }}>{d.name.charAt(0).toUpperCase()}</div>
                          <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[90px]">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono truncate max-w-[80px]">{d.host}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded-full font-semibold text-[10px] ${statusBadge(d.status)}`}>{d.status}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {d.latitude && d.longitude
                            ? <FiCheck className="h-3.5 w-3.5 text-green-500" title="Sudah dipetakan" />
                            : <FiMapPin className="h-3.5 w-3.5 text-gray-300" title="Belum dipetakan" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
              {filteredDevices.length} dari {devices.length} device
            </div>
          </div>
        )}

        {/* ── Tab: Customers ── */}
        {activeTab === "customers" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filters */}
            <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Cari nama / alamat..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all","PPPOE","DHCP","STATIC"] as const).map(t => (
                  <button key={t} onClick={() => setCustomerType(t)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${customerType === t
                      ? t === "all" ? "bg-brand-500 text-white" : t === "PPPOE" ? "bg-purple-500 text-white" : t === "DHCP" ? "bg-amber-500 text-white" : "bg-cyan-500 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                    {t === "all" ? "Semua" : t}
                  </button>
                ))}
                <button onClick={() => setCustomerActive(customerActive === "active" ? "all" : "active")}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${customerActive === "active" ? "bg-green-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                  Aktif
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Nama</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Paket</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Kontak</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Peta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredCustomers.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Tidak ada data</td></tr>
                  )}
                  {filteredCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                            style={{ background: customerColor(c) }}>{c.name.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[90px]">{c.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="px-1 py-0 rounded text-[9px] font-bold text-white" style={{ background: CUSTOMER_COLORS[c.type] ?? "#6b7280" }}>{c.type}</span>
                              <span className={`text-[9px] ${c.is_active ? "text-green-600" : "text-gray-400"}`}>{c.is_active ? "Aktif" : "Nonaktif"}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {c.package_name
                          ? <span className="text-indigo-600 dark:text-indigo-400 font-medium truncate block max-w-[80px]">{c.package_name}</span>
                          : <span className="text-gray-300">—</span>}
                        {c.address && <p className="text-gray-400 truncate max-w-[80px] text-[10px]">{c.address}</p>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                        {c.wa_number && <p className="truncate max-w-[80px]">WA: {c.wa_number}</p>}
                        {!c.wa_number && <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.latitude && c.longitude
                          ? <FiCheck className="h-3.5 w-3.5 text-green-500 mx-auto" />
                          : canEdit
                            ? <button onClick={() => { setSelectedCustomer(c); setEditMode("customer"); setTempLocation(null); }}
                                className="text-brand-500 hover:text-brand-700 mx-auto flex items-center justify-center" title="Set lokasi">
                                <FiMapPin className="h-3.5 w-3.5" />
                              </button>
                            : <FiMapPin className="h-3.5 w-3.5 text-gray-300 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
              {filteredCustomers.length} dari {customers.length} pelanggan · {customers.filter(c => c.latitude && c.longitude).length} dipetakan
            </div>
          </div>
        )}

        {/* ── Tab: ODP ── */}
        {activeTab === "odp" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filters */}
            <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={odpSearch} onChange={e => setOdpSearch(e.target.value)}
                  placeholder="Cari nama ODP..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all","normal","fault","inactive"] as const).map(s => (
                  <button key={s} onClick={() => setOdpStatus(s)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${odpStatus === s
                      ? s === "all" ? "bg-brand-500 text-white" : s === "normal" ? "bg-green-500 text-white" : s === "fault" ? "bg-red-500 text-white" : "bg-gray-500 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                    {s === "all" ? "Semua" : s === "normal" ? "Normal" : s === "fault" ? "Gangguan" : "Nonaktif"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Nama</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">ONU</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Port</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredOdps.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Tidak ada data</td></tr>
                  )}
                  {filteredOdps.map(o => {
                    const portPct = o.total_ports ? Math.round(((o.used_ports ?? 0) / o.total_ports) * 100) : 0;
                    const statusLabel = !o.is_active ? "Nonaktif" : o.fault_suspected ? "Gangguan" : "Normal";
                    const statusClass = !o.is_active ? "bg-gray-100 text-gray-500" : o.fault_suspected ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";
                    return (
                      <tr
                        key={o.id}
                        ref={(el) => { if (el) odpItemRefs.current.set(o.id, el); else odpItemRefs.current.delete(o.id); }}
                        onClick={() => setSelectedODP(o)}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer ${selectedODP?.id === o.id ? "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[110px]">{o.name}</p>
                          {o.ip_address && <p className="text-gray-400 font-mono">{o.ip_address}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={o.down_onus > 0 ? "text-red-600 font-semibold" : "text-gray-700 dark:text-gray-300"}>
                            {o.total_onus}{o.down_onus > 0 ? ` (${o.down_onus}↓)` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {o.total_ports != null ? (
                            <div className="space-y-0.5">
                              <span className={portPct >= 90 ? "text-red-600 font-semibold" : portPct >= 70 ? "text-amber-600" : "text-gray-600 dark:text-gray-300"}>
                                {o.used_ports ?? 0}/{o.total_ports}
                              </span>
                              <div className="h-1 w-12 rounded-full bg-gray-200 overflow-hidden">
                                <div className={`h-full rounded-full ${portPct >= 90 ? "bg-red-500" : portPct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                                  style={{ width: `${portPct}%` }} />
                              </div>
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
              {filteredOdps.length} dari {odps.length} ODP
            </div>
          </div>
        )}

        {/* ── Tab: ONT (GenieACS) ── */}
        {activeTab === "ont" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filters */}
            <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={acsSearch} onChange={e => setAcsSearch(e.target.value)}
                  placeholder="Cari serial / pabrikan..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>
              <div className="flex gap-1.5">
                {(["all", "online", "offline"] as const).map(s => (
                  <button key={s} onClick={() => setAcsStatus(s)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${acsStatus === s
                      ? s === "online" ? "bg-green-500 text-white" : s === "offline" ? "bg-gray-500 text-white" : "bg-brand-500 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                    {s === "all" ? "Semua" : s === "online" ? "Online" : "Offline"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Serial / IP</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">PPPoE / SSID</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Signal</th>
                    <th className="text-left px-2 py-2 font-semibold text-gray-500 dark:text-gray-400">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredAcs.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Tidak ada data</td></tr>
                  )}
                  {filteredAcs.map(d => {
                    const serial = acsSerial(d);
                    const mfr = acsManufacturer(d);
                    const online = acsIsOnline(d._lastInform);
                    const att = acsSignalAtt(d);
                    const ip = acsIP(d);
                    const pppoe = acsPPPoE(d);
                    const ssid = acsSSID(d);
                    const temp = acsTemp(d);
                    const clients = acsClientCount(d);
                    const isSelected = selectedAcsDevice?._id === d._id;
                    return (
                      <tr
                        key={d._id}
                        onClick={() => setSelectedAcsDevice(d)}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer ${isSelected ? "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-300 dark:ring-amber-700" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[90px]" title={serial}>{serial}</p>
                          <p className="text-gray-400 text-[10px]">{mfr}</p>
                          {ip !== "-" && <p className="font-mono text-[10px] text-gray-500 truncate max-w-[90px]">{ip}</p>}
                        </td>
                        <td className="px-3 py-2">
                          {pppoe !== "-" && <p className="truncate max-w-[90px] text-indigo-600 dark:text-indigo-400">{pppoe}</p>}
                          {ssid !== "-" && <p className="truncate max-w-[90px] text-gray-500 text-[10px]">{ssid}</p>}
                          {clients > 0 && <p className="text-gray-400 text-[10px]">{clients} klien</p>}
                          {pppoe === "-" && ssid === "-" && clients === 0 && <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${online ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                            <span className={online ? "text-green-600 dark:text-green-400" : "text-gray-400"}>
                              {online ? "Online" : "Offline"}
                            </span>
                          </div>
                          {att !== null && (
                            <p className={`tabular-nums text-[10px] ${att > 25 ? "text-red-500" : att > 20 ? "text-orange-500" : "text-gray-500 dark:text-gray-400"}`}>
                              {att.toFixed(1)} dB
                            </p>
                          )}
                          {temp !== null && (
                            <p className={`text-[10px] ${temp > 70 ? "text-red-500" : temp > 55 ? "text-orange-500" : "text-gray-400"}`}>
                              {temp}°C
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {(() => {
                            const isPinned = pinnedOnts.some(o => o.genieacs_id === d._id);
                            return isPinned ? (
                              <span title="Sudah di-pin" className="text-green-500">
                                <FiMapPin className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setPinningOnt(d); setSidebarOpen(true); }}
                                title="Pin ke peta"
                                className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                              >
                                <FiMapPin className="h-3.5 w-3.5" />
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
              {filteredAcs.length} dari {acsDevices.filter(d => acsDetectType(d) !== "odp").length} ONT/ONU GenieACS
            </div>
          </div>
        )}
      </div>

      {/* ── Pin ONT banner ── */}
      {pinningOnt && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-xl text-sm flex items-center gap-2 pointer-events-auto">
          <FiMapPin className="h-4 w-4 shrink-0" />
          <span>Klik lokasi di peta untuk pin <strong>{acsSerial(pinningOnt)}</strong></span>
          <button onClick={() => setPinningOnt(null)} className="ml-2 hover:text-indigo-200">
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Cable draw mode banners ── */}
      {cableDrawMode === "selecting-from" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-orange-500 text-white px-4 py-2 rounded-xl shadow-xl text-sm flex items-center gap-2 pointer-events-auto">
          <FiGitCommit className="h-4 w-4 shrink-0" />
          <span>Klik perangkat <strong>ASAL</strong> (Router / ODP / ONT)</span>
          <button onClick={() => setCableDrawMode("idle")} className="ml-2 hover:text-orange-200"><FiX className="h-4 w-4" /></button>
        </div>
      )}
      {cableDrawMode === "selecting-to" && cableFromDevice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-xl text-sm flex items-center gap-2 pointer-events-auto">
          <FiGitCommit className="h-4 w-4 shrink-0" />
          <span>Dari <strong>{cableFromDevice.name}</strong> — Klik perangkat <strong>TUJUAN</strong></span>
          <button onClick={() => { setCableDrawMode("idle"); setCableFromDevice(null); }} className="ml-2 hover:text-indigo-200"><FiX className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Save Cable Form ── */}
      {cableForm && (
        <div className="absolute inset-0 z-[2000] flex items-end justify-center pb-8 pointer-events-none">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 w-80 pointer-events-auto">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <FiGitCommit className="text-orange-500" />
              Simpan Kabel Fiber
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nama kabel</label>
                <input
                  value={cableForm.name}
                  onChange={e => setCableForm(f => f ? { ...f, name: e.target.value } : f)}
                  placeholder="Kabel ODP-01 ke ODP-02..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipe kabel</label>
                <select
                  value={cableForm.cable_type}
                  onChange={e => setCableForm(f => f ? { ...f, cable_type: e.target.value as 'fiber'|'drop'|'trunk' } : f)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="fiber">Fiber (feeder)</option>
                  <option value="drop">Drop cable</option>
                  <option value="trunk">Trunk</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Warna</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cableForm.color}
                    onChange={e => setCableForm(f => f ? { ...f, color: e.target.value } : f)}
                    className="h-8 w-12 rounded border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500">{cableForm.color}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveCable}
                  className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
                >
                  Simpan
                </button>
                <button
                  onClick={() => { setCableForm(null); setCableFromDevice(null); setCableToDevice(null); }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer edit mode banner ── */}
      {editMode === "customer" && selectedCustomer && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-white dark:bg-gray-800 shadow-lg border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3 flex items-center gap-4 animate-slide-in-right">
          <FiMapPin className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Klik peta</span> untuk mengatur lokasi <span className="font-semibold text-blue-600">{selectedCustomer.name}</span>
            {tempLocation && <span className="ml-2 text-gray-400 text-xs">{tempLocation[0].toFixed(5)}, {tempLocation[1].toFixed(5)}</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => { setEditMode(null); setTempLocation(null); setSelectedCustomer(null); }}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-300 transition-colors">
              Batal
            </button>
            <button onClick={handleSaveLocation} disabled={!tempLocation || saving}
              className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-1">
              <FiSave className="h-3.5 w-3.5" />{saving ? "..." : "Simpan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}