"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FiRefreshCw,
  FiSearch,
  FiWifiOff,
  FiSettings,
  FiDownload,
  FiX,
  FiChevronLeft,
  FiChevronRight as FiArrow,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiInfo,
  FiActivity,
  FiCpu,
  FiMap,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useGenieACSDevices } from "@/lib/hooks/useGenieACSDevices";
import { OpticalApi } from "@/lib/api/genieacs";
import { SweetAlert } from "@/lib/sweetalert";
import type { GenieACSDevice, ODPSummary, OpticalDevice } from "@/types/optical.types";
import { useOpticalSelectionStore } from "@/store/opticalSelectionStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectDeviceType(device: GenieACSDevice): "olt" | "odp" | "onu" {
  const productClass = (device._deviceId?._ProductClass ?? "").toLowerCase();
  const manufacturer = (device._deviceId?._Manufacturer ?? "").toLowerCase();
  const combined = `${manufacturer} ${productClass}`;
  if (/\bolt\b|c300|c600|c320|ma5800|ma5600/.test(combined)) return "olt";
  if (/\bodp\b|optical.*distrib|passive.*distrib/.test(combined)) return "odp";
  return "onu";
}

function extractDeviceIDField(device: GenieACSDevice, field: string): string {
  const deviceId = device._deviceId as Record<string, string | undefined> | undefined;
  return deviceId?.[`_${field}`] ?? "-";
}

function shortManufacturer(name: string): string {
  if (!name || name === "-") return name;
  const lower = name.toLowerCase();
  if (lower.includes("huawei")) return "Huawei";
  if (lower.includes("zte")) return "ZTE";
  if (lower.includes("fiberhome") || lower.includes("fiber home")) return "FiberHome";
  if (lower.includes("tp-link") || lower.includes("tplink")) return "TP-Link";
  if (lower.includes("calix")) return "Calix";
  // Return first word as fallback
  return name.split(/[\s,]/)[0];
}

function formatLastInform(lastInform?: string): string {
  if (!lastInform) return "-";
  try {
    return new Date(lastInform).toLocaleString("id-ID");
  } catch {
    return lastInform;
  }
}

function isOnline(lastInform?: string): boolean {
  if (!lastInform) return false;
  return Date.now() - new Date(lastInform).getTime() < 15 * 60 * 1000;
}

// ─── Signal extraction from list-endpoint data ────────────────────────────────
// Backend now includes ZTE and Huawei optical power paths in the projection.

const RX_PATHS = [
  ["InternetGatewayDevice", "X_ZTE_COM_GponParm", "RxOpticalPower"],
  ["InternetGatewayDevice", "WANDevice", "1", "X_HW_GPON", "RxPower"],
];
const TX_PATHS = [
  ["InternetGatewayDevice", "X_ZTE_COM_GponParm", "TxOpticalPower"],
  ["InternetGatewayDevice", "WANDevice", "1", "X_HW_GPON", "TxPower"],
];
const TEMP_PATHS = [
  ["InternetGatewayDevice", "DeviceInfo", "X_HW_Temperature"],
  ["InternetGatewayDevice", "X_ZTE_COM_TempInfo", "Temperature"],
];
const PPPOE_PATHS = [
  ["InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANPPPConnection", "1", "Username"],
];

function extractLeafValue(node: unknown, parts: string[]): number | null {
  let cur: unknown = node;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (!cur || typeof cur !== "object") return null;
  const leaf = cur as Record<string, unknown>;
  const raw = leaf["_value"];
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  return isNaN(num) ? null : num;
}

function extractTemp(device: GenieACSDevice): number | null {
  for (const path of TEMP_PATHS) {
    const v = extractLeafValue(device, path);
    if (v !== null) return v;
  }
  return null;
}

function extractPPPoE(device: GenieACSDevice): string {
  for (const path of PPPOE_PATHS) {
    let cur: unknown = device;
    for (const p of path) {
      if (!cur || typeof cur !== "object") { cur = null; break; }
      cur = (cur as Record<string, unknown>)[p];
    }
    if (cur && typeof cur === "object") {
      const v = (cur as Record<string, unknown>)["_value"];
      if (v && String(v) !== "") return String(v);
    }
  }
  return "-";
}

function extractIP(device: GenieACSDevice): string {
  return getLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANIPConnection", "1", "ExternalIPAddress")
    || getLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANPPPConnection", "1", "ExternalIPAddress");
}

function extractMAC(device: GenieACSDevice): string {
  return getLeafStr(device, "InternetGatewayDevice", "WANDevice", "1", "WANCommonInterfaceConfig", "MACAddress");
}

function extractSSID(device: GenieACSDevice): string {
  return getLeafStr(device, "InternetGatewayDevice", "LANDevice", "1", "WLANConfiguration", "1", "SSID");
}

interface SignalValues { rx: number | null; tx: number | null; att: number | null }

function extractSignal(device: GenieACSDevice): SignalValues {
  let rx: number | null = null;
  let tx: number | null = null;

  for (const path of RX_PATHS) {
    const v = extractLeafValue(device, path);
    if (v !== null) { rx = v; break; }
  }
  for (const path of TX_PATHS) {
    const v = extractLeafValue(device, path);
    if (v !== null) { tx = v; break; }
  }

  // ZTE encodes in 0.001 dBm — values > |100| means raw unit
  if (rx !== null && Math.abs(rx) > 100) rx = rx / 1000;
  if (tx !== null && Math.abs(tx) > 100) tx = tx / 1000;

  const att = rx !== null && tx !== null ? tx - rx : null;
  return { rx, tx, att };
}

function SignalCell({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return <span className="text-xs text-gray-400 dark:text-gray-600">—</span>;
  }
  let color = "text-green-600 dark:text-green-400";
  if (label === "RX" || label === "TX") {
    if (value < -28) color = "text-red-600 dark:text-red-400";
    else if (value < -24) color = "text-orange-500 dark:text-orange-400";
  } else if (label === "Att") {
    // Higher attenuation = worse signal loss
    if (value > 25) color = "text-red-600 dark:text-red-400";
    else if (value > 20) color = "text-orange-500 dark:text-orange-400";
  }
  return (
    <div className="flex items-baseline gap-0.5">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value.toFixed(1)}</span>
      <span className="text-xs text-gray-400">dBm</span>
    </div>
  );
}

// ─── TR-069 parameter tree traversal ─────────────────────────────────────────
// GenieACS wraps leaf values as { _value, _timestamp, _type, _writable }

type ParamNode = Record<string, unknown>;

interface FlatParam {
  path: string;
  value: string;
  timestamp?: string;
  writable?: boolean;
}

function flattenParams(node: unknown, prefix = "", out: FlatParam[] = []): FlatParam[] {
  if (!node || typeof node !== "object") return out;
  const obj = node as ParamNode;

  // Leaf node: has _value key
  if ("_value" in obj) {
    const raw = obj._value;
    const val = raw === null || raw === undefined ? "-" : String(raw);
    const ts = typeof obj._timestamp === "number"
      ? new Date(obj._timestamp).toLocaleString("id-ID")
      : undefined;
    out.push({ path: prefix, value: val, timestamp: ts, writable: obj._writable === true });
    return out;
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("_")) continue; // skip meta keys like _id, _lastInform, etc.
    flattenParams(obj[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

// Signal-related keyword patterns
const SIGNAL_KEYWORDS = [
  "rxpower", "txpower", "rx_power", "tx_power", "rxoptical", "txoptical",
  "gpon", "optical", "signal", "attenuation", "rssi", "snr", "ber",
  "power", "dbm", "loss",
];

function isSignalParam(path: string): boolean {
  const lower = path.toLowerCase().replace(/[._]/g, "");
  return SIGNAL_KEYWORDS.some((kw) => lower.includes(kw.replace(/[._]/g, "")));
}

function formatSignalValue(path: string, raw: string): { display: string; unit: string; color: string } {
  const lower = path.toLowerCase();
  const num = parseFloat(raw);
  const isDbm = lower.includes("power") || lower.includes("dbm") || lower.includes("rx") || lower.includes("tx");

  if (isNaN(num)) return { display: raw, unit: "", color: "text-gray-600 dark:text-gray-400" };

  // ZTE devices encode in 0.001 dBm units
  const val = Math.abs(num) > 100 ? num / 1000 : num;
  const display = val.toFixed(2);

  if (isDbm) {
    let color = "text-green-600 dark:text-green-400";
    if (val < -28) color = "text-red-600 dark:text-red-400";
    else if (val < -24) color = "text-orange-500 dark:text-orange-400";
    return { display, unit: "dBm", color };
  }

  return { display, unit: "", color: "text-gray-700 dark:text-gray-300" };
}

// Group params by second-level namespace (e.g. "DeviceInfo", "ManagementServer", "WANDevice", etc.)
function groupParams(params: FlatParam[]): Record<string, FlatParam[]> {
  const groups: Record<string, FlatParam[]> = {};
  for (const p of params) {
    const parts = p.path.split(".");
    // Use second segment if available (skip "InternetGatewayDevice" prefix), else first
    let group: string;
    if (parts[0] === "InternetGatewayDevice" && parts.length > 1) {
      group = parts[1];
    } else {
      group = parts[0] ?? "Other";
    }
    if (!groups[group]) groups[group] = [];
    groups[group].push(p);
  }
  return groups;
}

// ─── Structured field extraction from full TR-069 tree ───────────────────────

function getLeafStr(node: unknown, ...parts: string[]): string {
  let cur: unknown = node;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return "-";
    cur = (cur as Record<string, unknown>)[p];
  }
  if (!cur || typeof cur !== "object") return "-";
  const v = (cur as Record<string, unknown>)["_value"];
  return v === null || v === undefined || v === "" ? "-" : String(v);
}

interface LanHost {
  hostname: string;
  ip: string;
  mac: string;
  active: boolean;
}

function extractLanHosts(device: unknown): LanHost[] {
  const hosts: LanHost[] = [];
  try {
    const igd = (device as Record<string, unknown>)["InternetGatewayDevice"];
    if (!igd || typeof igd !== "object") return hosts;
    const lhTable = (igd as Record<string, unknown>)["LANDevice"];
    if (!lhTable || typeof lhTable !== "object") return hosts;
    // LANDevice.1.Hosts.Host.{i}
    const lanDev = (lhTable as Record<string, unknown>)["1"];
    if (!lanDev || typeof lanDev !== "object") return hosts;
    const hostsObj = (lanDev as Record<string, unknown>)["Hosts"];
    if (!hostsObj || typeof hostsObj !== "object") return hosts;
    const hostTable = (hostsObj as Record<string, unknown>)["Host"];
    if (!hostTable || typeof hostTable !== "object") return hosts;
    for (const idx of Object.keys(hostTable as object)) {
      if (idx.startsWith("_")) continue;
      const h = (hostTable as Record<string, unknown>)[idx];
      if (!h || typeof h !== "object") continue;
      const get = (k: string) => {
        const leaf = (h as Record<string, unknown>)[k];
        if (!leaf || typeof leaf !== "object") return "";
        const v = (leaf as Record<string, unknown>)["_value"];
        return v === null || v === undefined ? "" : String(v);
      };
      hosts.push({
        hostname: get("HostName") || get("X_HW_HostName") || "",
        ip: get("IPAddress"),
        mac: get("MACAddress"),
        active: get("Active") === "true" || get("Active") === "1",
      });
    }
  } catch { /* ignore */ }
  return hosts;
}

// ─── TR-069 Parameter Aliases ─────────────────────────────────────────────────

// Static exact-match aliases
const TR069_ALIASES: Record<string, string> = {
  // ── DeviceInfo ──────────────────────────────────────────────────────────────
  "InternetGatewayDevice.DeviceInfo.Manufacturer":                    "Pabrikan",
  "InternetGatewayDevice.DeviceInfo.ManufacturerOUI":                 "OUI Pabrikan",
  "InternetGatewayDevice.DeviceInfo.ModelName":                       "Model Perangkat",
  "InternetGatewayDevice.DeviceInfo.Description":                     "Deskripsi",
  "InternetGatewayDevice.DeviceInfo.ProductClass":                    "Kelas Produk",
  "InternetGatewayDevice.DeviceInfo.SerialNumber":                    "Serial Number",
  "InternetGatewayDevice.DeviceInfo.HardwareVersion":                 "Versi Hardware",
  "InternetGatewayDevice.DeviceInfo.SoftwareVersion":                 "Versi Firmware",
  "InternetGatewayDevice.DeviceInfo.AdditionalSoftwareVersion":       "Versi Firmware Tambahan",
  "InternetGatewayDevice.DeviceInfo.SpecVersion":                     "Versi Spesifikasi TR-069",
  "InternetGatewayDevice.DeviceInfo.ProvisioningCode":                "Kode Provisioning",
  "InternetGatewayDevice.DeviceInfo.UpTime":                          "Uptime (detik)",
  "InternetGatewayDevice.DeviceInfo.FirstUseDate":                    "Pertama Digunakan",
  "InternetGatewayDevice.DeviceInfo.DeviceLog":                       "Log Perangkat",
  "InternetGatewayDevice.DeviceInfo.VendorConfigFileNumberOfEntries": "Jumlah Config File",
  "InternetGatewayDevice.DeviceInfo.X_HW_Temperature":                "Suhu Perangkat (°C)",
  "InternetGatewayDevice.DeviceInfo.X_HW_MemoryUsage":                "Penggunaan Memori (%)",
  "InternetGatewayDevice.DeviceInfo.X_HW_CpuUsage":                   "Penggunaan CPU (%)",

  // ── ManagementServer ────────────────────────────────────────────────────────
  "InternetGatewayDevice.ManagementServer.URL":                                  "URL Server ACS",
  "InternetGatewayDevice.ManagementServer.Username":                             "Username ACS",
  "InternetGatewayDevice.ManagementServer.Password":                             "Password ACS",
  "InternetGatewayDevice.ManagementServer.PeriodicInformEnable":                 "Inform Berkala Aktif",
  "InternetGatewayDevice.ManagementServer.PeriodicInformInterval":               "Interval Inform (detik)",
  "InternetGatewayDevice.ManagementServer.PeriodicInformTime":                   "Waktu Inform Berkala",
  "InternetGatewayDevice.ManagementServer.ParameterKey":                         "Kunci Parameter",
  "InternetGatewayDevice.ManagementServer.ConnectionRequestURL":                 "URL Permintaan Koneksi",
  "InternetGatewayDevice.ManagementServer.ConnectionRequestUsername":            "Username Permintaan Koneksi",
  "InternetGatewayDevice.ManagementServer.ConnectionRequestPassword":            "Password Permintaan Koneksi",
  "InternetGatewayDevice.ManagementServer.UpgradesManaged":                      "Upgrade Dikelola ACS",
  "InternetGatewayDevice.ManagementServer.KickURL":                              "URL Kick",
  "InternetGatewayDevice.ManagementServer.DownloadProgressURL":                  "URL Progress Download",
  "InternetGatewayDevice.ManagementServer.DefaultActiveNotificationThrottle":    "Throttle Notifikasi Aktif",
  "InternetGatewayDevice.ManagementServer.CWMPRetryMinimumWaitInterval":         "Interval Retry Minimum (detik)",
  "InternetGatewayDevice.ManagementServer.CWMPRetryIntervalMultiplier":          "Pengali Interval Retry",
  "InternetGatewayDevice.ManagementServer.NATDetected":                          "NAT Terdeteksi",

  // ── Time ────────────────────────────────────────────────────────────────────
  "InternetGatewayDevice.Time.Enable":              "Sinkronisasi Waktu Aktif",
  "InternetGatewayDevice.Time.Status":              "Status Waktu",
  "InternetGatewayDevice.Time.NTPServer1":          "Server NTP 1",
  "InternetGatewayDevice.Time.NTPServer2":          "Server NTP 2",
  "InternetGatewayDevice.Time.NTPServer3":          "Server NTP 3",
  "InternetGatewayDevice.Time.CurrentLocalTime":    "Waktu Lokal Sekarang",
  "InternetGatewayDevice.Time.LocalTimeZone":       "Zona Waktu",
  "InternetGatewayDevice.Time.LocalTimeZoneName":   "Nama Zona Waktu",
  "InternetGatewayDevice.Time.DaylightSavingsUsed": "Gunakan Daylight Saving",

  // ── UserInterface ───────────────────────────────────────────────────────────
  "InternetGatewayDevice.UserInterface.PasswordRequired":       "Password UI Diperlukan",
  "InternetGatewayDevice.UserInterface.PasswordUserSelectable": "Password Bisa Diubah User",
  "InternetGatewayDevice.UserInterface.UpgradeAvailable":       "Upgrade Tersedia",
  "InternetGatewayDevice.UserInterface.WarrantyDate":           "Tanggal Garansi",
  "InternetGatewayDevice.UserInterface.ISPName":                "Nama ISP",
  "InternetGatewayDevice.UserInterface.ISPHelpDesk":            "Help Desk ISP",
  "InternetGatewayDevice.UserInterface.ISPHomePage":            "Halaman Web ISP",

  // ── Layer3Forwarding ────────────────────────────────────────────────────────
  "InternetGatewayDevice.Layer3Forwarding.DefaultConnectionService": "Koneksi Default",
  "InternetGatewayDevice.Layer3Forwarding.ForwardNumberOfEntries":   "Jumlah Entri Routing",

  // ── WAN Common ──────────────────────────────────────────────────────────────
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType":              "Tipe Akses WAN",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.Layer1UpstreamMaxBitRate":   "Kecepatan Upload Maks (bps)",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.Layer1DownstreamMaxBitRate": "Kecepatan Download Maks (bps)",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.PhysicalLinkStatus":         "Status Link Fisik WAN",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.MACAddress":                 "MAC Address WAN",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent":             "Total Byte Terkirim",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived":         "Total Byte Diterima",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsSent":           "Total Paket Terkirim",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsReceived":       "Total Paket Diterima",
  "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANConnectionNumberOfEntries": "Jumlah Koneksi WAN",

  // ── WAN IP Connection ────────────────────────────────────────────────────────
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable":              "Koneksi WAN Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionStatus":    "Status Koneksi WAN",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Name":                "Nama Koneksi",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Uptime":              "Uptime Koneksi (detik)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.LastConnectionError": "Error Koneksi Terakhir",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress":   "IP Address (WAN)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.SubnetMask":          "Subnet Mask WAN",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DefaultGateway":      "Default Gateway",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress":          "MAC Address Koneksi IP",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSEnabled":          "DNS Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers":          "Server DNS",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddressOverride":  "Override MAC Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionType":      "Tipe Koneksi IP",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.AddressingType":      "Tipe Pemberian Alamat",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.NATEnabled":          "NAT Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.FirewallEnabled":     "Firewall Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMappingNumberOfEntries": "Jumlah Port Mapping",

  // ── WAN PPP Connection ───────────────────────────────────────────────────────
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable":              "Koneksi PPPoE Aktif",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus":    "Status Koneksi PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Name":                "Nama Koneksi PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime":              "Uptime PPPoE (detik)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.LastConnectionError": "Error PPPoE Terakhir",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username":            "Username PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password":            "Password PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress":   "IP Address (PPPoE)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.RemoteIPAddress":     "IP Remote PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.SubnetMask":          "Subnet Mask PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway":      "Gateway PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers":          "DNS PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress":          "MAC Address PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionType":      "Tipe Koneksi PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.NATEnabled":          "NAT Aktif (PPPoE)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.FirewallEnabled":     "Firewall Aktif (PPPoE)",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.PPPoESessionID":      "ID Sesi PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.PPPoEACName":         "Nama AC PPPoE",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.PPPoEServiceName":    "Nama Layanan PPPoE",

  // ── LAN DHCP & Host Config ───────────────────────────────────────────────────
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable":     "DHCP Server Aktif",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPRelay":            "DHCP Relay Aktif",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress":           "IP DHCP Mulai",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress":           "IP DHCP Akhir",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.ReservedAddresses":    "Alamat IP Dicadangkan",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask":           "Subnet Mask DHCP",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers":           "DNS Server (DHCP)",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DomainName":           "Nama Domain LAN",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters":            "IP Router (Gateway LAN)",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime":        "Waktu Sewa DHCP (detik)",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.UseAllocatedWAN":      "Gunakan IP WAN",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.AssociatedConnection": "Koneksi Terkait",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.AllowedMACAddresses":  "MAC Address Diizinkan",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.Enable":               "Interface LAN Aktif",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress": "IP Address LAN",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask": "Subnet Mask LAN",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.SubnetMask":           "Subnet Mask LAN",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.AddressingType":       "Tipe Alamat LAN",

  // ── LAN Ethernet Interface ───────────────────────────────────────────────────
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.Enable":                    "Port LAN Aktif",
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.Status":                    "Status Port LAN",
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress":                "MAC Address LAN",
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddressControlEnabled":  "Kontrol MAC Aktif",
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MaxBitRate":                "Kecepatan Maks LAN",
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.DuplexMode":                "Mode Duplex LAN",

  // ── GPON Optical — ZTE ──────────────────────────────────────────────────────
  "InternetGatewayDevice.X_ZTE_COM_GponParm.RxOpticalPower": "Daya Terima RX (dBm)",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.TxOpticalPower": "Daya Kirim TX (dBm)",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.LOID":           "LOID GPON",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.LOIDPassword":   "Password LOID",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.PLOAM":          "Status PLOAM",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.ONUState":        "Status ONU",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.ONUID":           "ID ONU",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.SerialNumber":    "Serial GPON",
  "InternetGatewayDevice.X_ZTE_COM_GponParm.EquipmentID":     "ID Perangkat GPON",

  // ── Temperature — ZTE ────────────────────────────────────────────────────────
  "InternetGatewayDevice.X_ZTE_COM_TempInfo.Temperature":  "Suhu Perangkat (°C)",
  "InternetGatewayDevice.X_ZTE_COM_TempInfo.VoltageValue": "Tegangan (mV)",
  "InternetGatewayDevice.X_ZTE_COM_TempInfo.CurrentValue": "Arus Bias (mA)",

  // ── GPON Optical — Huawei ────────────────────────────────────────────────────
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.RxPower":   "Daya Terima RX (dBm)",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.TxPower":   "Daya Kirim TX (dBm)",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.Voltage":   "Tegangan (mV)",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.Current":   "Arus (mA)",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.Temperature": "Suhu Modul Optik (°C)",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.ONUState":  "Status ONU Huawei",
  "InternetGatewayDevice.WANDevice.1.X_HW_GPON.LOID":      "LOID Huawei",

  // ── Huawei Gateway Info ──────────────────────────────────────────────────────
  "InternetGatewayDevice.X_HW_WEB_COM_GWINFO.Ping":           "Ping (ms)",
  "InternetGatewayDevice.X_HW_WEB_COM_GWINFO.InternetStatus": "Status Internet",
};

// Wildcard rules: match by suffix (last N segments) for dynamic-index paths
const TR069_SUFFIX_ALIASES: Array<[string, string]> = [
  // LAN Hosts (LANDevice.1.Hosts.Host.{n}.*)
  [".Hosts.Host.*.HostName",           "Hostname Klien"],
  [".Hosts.Host.*.IPAddress",          "IP Klien"],
  [".Hosts.Host.*.MACAddress",         "MAC Klien"],
  [".Hosts.Host.*.Active",             "Aktif"],
  [".Hosts.Host.*.AddressSource",      "Sumber Alamat"],
  [".Hosts.Host.*.LeaseTimeRemaining", "Sisa Sewa DHCP (detik)"],
  [".Hosts.Host.*.InterfaceType",      "Tipe Interface Klien"],
  [".Hosts.Host.*.Layer2Interface",    "Interface Layer 2"],
  // WiFi (WLANConfiguration.{n}.*)
  [".WLANConfiguration.*.SSID",                    "Nama WiFi (SSID)"],
  [".WLANConfiguration.*.Enable",                  "WiFi Aktif"],
  [".WLANConfiguration.*.Status",                  "Status WiFi"],
  [".WLANConfiguration.*.Channel",                 "Channel WiFi"],
  [".WLANConfiguration.*.AutoChannelEnable",        "Channel Otomatis"],
  [".WLANConfiguration.*.Standard",                "Standar WiFi"],
  [".WLANConfiguration.*.BeaconType",              "Tipe Keamanan WiFi"],
  [".WLANConfiguration.*.MACAddressControlEnabled", "Filter MAC Aktif"],
  [".WLANConfiguration.*.BasicEncryptionModes",    "Mode Enkripsi Dasar"],
  [".WLANConfiguration.*.WPAEncryptionModes",      "Mode Enkripsi WPA"],
  [".WLANConfiguration.*.IEEE11iEncryptionModes",  "Mode Enkripsi WPA2"],
  [".WLANConfiguration.*.KeyPassphrase",           "Password WiFi"],
  [".WLANConfiguration.*.WEPKey",                  "Kunci WEP"],
  [".WLANConfiguration.*.PreSharedKey.*.PreSharedKey", "Pre-Shared Key"],
  [".WLANConfiguration.*.MACAddress",              "MAC Address WiFi"],
  [".WLANConfiguration.*.BSSID",                   "BSSID"],
  [".WLANConfiguration.*.TotalBytesSent",          "Total Byte Terkirim WiFi"],
  [".WLANConfiguration.*.TotalBytesReceived",      "Total Byte Diterima WiFi"],
  [".WLANConfiguration.*.TotalAssociations",       "Jumlah Klien Terhubung"],
  [".WLANConfiguration.*.MaxBitRate",              "Kecepatan Maks WiFi"],
  // WAN IP Connection (dynamic index)
  [".WANIPConnection.*.Enable",            "Koneksi WAN Aktif"],
  [".WANIPConnection.*.ConnectionStatus",  "Status Koneksi WAN"],
  [".WANIPConnection.*.ExternalIPAddress", "IP Address (WAN)"],
  [".WANIPConnection.*.SubnetMask",        "Subnet Mask WAN"],
  [".WANIPConnection.*.DefaultGateway",   "Default Gateway"],
  [".WANIPConnection.*.DNSServers",        "Server DNS WAN"],
  [".WANIPConnection.*.MACAddress",        "MAC Address Koneksi"],
  [".WANIPConnection.*.NATEnabled",        "NAT Aktif"],
  [".WANIPConnection.*.Uptime",            "Uptime Koneksi (detik)"],
  // WAN PPP Connection (dynamic index)
  [".WANPPPConnection.*.Enable",           "Koneksi PPPoE Aktif"],
  [".WANPPPConnection.*.ConnectionStatus", "Status PPPoE"],
  [".WANPPPConnection.*.Username",         "Username PPPoE"],
  [".WANPPPConnection.*.ExternalIPAddress","IP Address (PPPoE)"],
  [".WANPPPConnection.*.DNSServers",       "Server DNS PPPoE"],
  [".WANPPPConnection.*.MACAddress",       "MAC Address PPPoE"],
  [".WANPPPConnection.*.Uptime",           "Uptime PPPoE (detik)"],
  [".WANPPPConnection.*.PPPoESessionID",   "ID Sesi PPPoE"],
  // LAN Ethernet (dynamic index)
  [".LANEthernetInterfaceConfig.*.Enable",     "Port Ethernet Aktif"],
  [".LANEthernetInterfaceConfig.*.Status",     "Status Port Ethernet"],
  [".LANEthernetInterfaceConfig.*.MACAddress", "MAC Address Ethernet"],
  [".LANEthernetInterfaceConfig.*.MaxBitRate", "Kecepatan Maks Ethernet"],
  // Layer3 Forwarding entries (dynamic index)
  [".Forwarding.*.DestIPAddress",   "Tujuan Routing"],
  [".Forwarding.*.GatewayIPAddress","Gateway Routing"],
  [".Forwarding.*.Interface",       "Interface Routing"],
  [".Forwarding.*.Enable",          "Routing Aktif"],
];

function getParamAlias(fullPath: string): string | null {
  // 1. Exact match
  if (TR069_ALIASES[fullPath]) return TR069_ALIASES[fullPath];

  // 2. Wildcard suffix match — replace numeric segments with *
  const normalized = fullPath.replace(/\.(\d+)\./g, ".*.").replace(/\.(\d+)$/, ".*");
  for (const [pattern, label] of TR069_SUFFIX_ALIASES) {
    if (normalized.endsWith(pattern) || normalized.includes(pattern)) return label;
  }

  return null;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${online
        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "animate-pulse bg-green-500" : "bg-gray-400"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  device: GenieACSDevice;
  importedName?: string;
  onClose: () => void;
}

function DetailDrawer({ device, importedName, onClose }: DetailDrawerProps) {
  const [fullDevice, setFullDevice] = useState<GenieACSDevice | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"signal" | "params" | "info">("info");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoadingDetail(true);
    setDetailError(null);
    OpticalApi.getGenieACSDevice(device._id)
      .then((d) => setFullDevice(d ?? device))
      .catch(() => {
        setDetailError("Tidak dapat mengambil detail dari GenieACS. Server GenieACS mungkin tidak aktif atau belum dikonfigurasi.");
        setFullDevice(device);
      })
      .finally(() => setLoadingDetail(false));
  }, [device]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const online = isOnline(device._lastInform);
  const src = fullDevice ?? device;

  const allParams = useMemo(() => flattenParams(src, ""), [src]);
  const signalParams = useMemo(() => allParams.filter((p) => isSignalParam(p.path)), [allParams]);
  const paramGroups = useMemo(() => groupParams(allParams), [allParams]);

  // Auto-open all groups when data loads
  useEffect(() => {
    setOpenGroups(new Set(Object.keys(paramGroups)));
  }, [paramGroups]);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const manufacturer = extractDeviceIDField(device, "Manufacturer");
  const model = extractDeviceIDField(device, "ProductClass");
  const serial = extractDeviceIDField(device, "SerialNumber");
  const oui = extractDeviceIDField(device, "OUI");

  const tabs = [
    { id: "signal" as const, label: "Redama & Sinyal", icon: <FiActivity className="h-3.5 w-3.5" /> },
    { id: "params" as const, label: "Parameter TR-069", icon: <FiCpu className="h-3.5 w-3.5" /> },
    { id: "info" as const, label: "Info Perangkat", icon: <FiInfo className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      {/* Backdrop — sits below header */}
      <div
        className="fixed inset-x-0 bottom-0 top-16 z-[9000] bg-black/40 backdrop-blur-sm lg:top-[72px]"
        onClick={onClose}
      />

      {/* Drawer — starts below header */}
      <div className="fixed bottom-0 right-0 top-16 z-[9001] flex w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-gray-900 lg:top-[72px]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <StatusBadge online={online} />
              {device._tags && device._tags.length > 0 && device._tags.map((tag) => (
                <span key={tag} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {tag}
                </span>
              ))}
            </div>
            {importedName && (
              <p className="mt-1.5 text-base font-semibold text-gray-900 dark:text-white">
                {importedName}
              </p>
            )}
            <p className={`truncate font-mono text-xs text-gray-400 dark:text-gray-500 ${importedName ? "" : "mt-2 text-sm font-semibold text-gray-900 dark:text-white"}`} title={device._id}>
              {device._id}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {[manufacturer, model].filter((v) => v !== "-").join(" · ")} · SN: {serial}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 px-6 dark:border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors ${activeTab === tab.id
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
            </div>
          ) : (
            <>
              {detailError && (
                <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
                  {detailError}
                </div>
              )}
              {/* ── Tab: Sinyal ── */}
              {activeTab === "signal" && (
                <div className="space-y-4">
                  {signalParams.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-gray-400">
                      <FiActivity className="h-8 w-8 opacity-40" />
                      <p>Tidak ada parameter sinyal ditemukan.</p>
                      <p className="text-xs">Perangkat mungkin belum terdaftar atau belum memiliki data redama.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {signalParams.map((p) => {
                        const { display, unit, color } = formatSignalValue(p.path, p.value);
                        const label = p.path.split(".").pop() ?? p.path;
                        return (
                          <div key={p.path} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={p.path}>
                              {p.path}
                            </p>
                            <div className="mt-1 flex items-end gap-1">
                              <span className={`text-2xl font-bold tabular-nums ${color}`}>{display}</span>
                              {unit && <span className="mb-0.5 text-sm font-medium text-gray-400">{unit}</span>}
                            </div>
                            <p className="mt-1 text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                            {p.timestamp && (
                              <p className="mt-1 text-xs text-gray-400">{p.timestamp}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Parameter TR-069 ── */}
              {activeTab === "params" && (
                <div className="space-y-2">
                  {Object.keys(paramGroups).length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">Tidak ada parameter tersedia.</p>
                  ) : (
                    Object.entries(paramGroups).map(([group, params]) => {
                      const isOpen = openGroups.has(group);
                      return (
                        <div key={group} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => toggleGroup(group)}
                            className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-left dark:bg-gray-800/60"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{group}</span>
                              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                {params.length}
                              </span>
                            </div>
                            <FiArrow className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </button>

                          {isOpen && (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                              {params.map((p) => {
                                const tail = p.path.split(".").slice(1).join(".");
                                const alias = getParamAlias(p.path);
                                return (
                                  <div key={p.path} className="flex items-start justify-between gap-4 px-4 py-2.5">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300" title={p.path}>
                                        {alias ?? tail ?? p.path}
                                      </p>
                                      {alias && (
                                        <p className="mt-0.5 truncate font-mono text-[10px] text-gray-400 dark:text-gray-500" title={p.path}>
                                          {tail || p.path}
                                        </p>
                                      )}
                                      {p.timestamp && (
                                        <p className="mt-0.5 text-xs text-gray-400">{p.timestamp}</p>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      {p.writable && (
                                        <span className="rounded bg-yellow-100 px-1 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                          RW
                                        </span>
                                      )}
                                      <span className="max-w-[160px] truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200" title={p.value}>
                                        {p.value}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── Tab: Info Perangkat ── */}
              {activeTab === "info" && (() => {
                const d = src;
                const hwVer = getLeafStr(d, "InternetGatewayDevice", "DeviceInfo", "HardwareVersion");
                const swVer = getLeafStr(d, "InternetGatewayDevice", "DeviceInfo", "SoftwareVersion");
                const uptime = getLeafStr(d, "InternetGatewayDevice", "DeviceInfo", "UpTime");
                const ip = getLeafStr(d, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANIPConnection", "1", "ExternalIPAddress")
                  || getLeafStr(d, "InternetGatewayDevice", "WANDevice", "1", "WANConnectionDevice", "1", "WANPPPConnection", "1", "ExternalIPAddress");
                const mac = getLeafStr(d, "InternetGatewayDevice", "WANDevice", "1", "WANCommonInterfaceConfig", "MACAddress");
                const ssid = getLeafStr(d, "InternetGatewayDevice", "LANDevice", "1", "WLANConfiguration", "1", "SSID");
                const wlanEn = getLeafStr(d, "InternetGatewayDevice", "LANDevice", "1", "WLANConfiguration", "1", "Enable");
                const ping = getLeafStr(d, "InternetGatewayDevice", "X_HW_WEB_COM_GWINFO", "Ping")
                  || getLeafStr(d, "InternetGatewayDevice", "X_00E0FC_GponInfo", "PingRTT");
                const lanHosts = extractLanHosts(d);

                const Section = ({ title, rows }: { title: string; rows: { label: string; value: string; mono?: boolean }[] }) => {
                  const visible = rows.filter(r => r.value && r.value !== "-");
                  if (visible.length === 0) return null;
                  return (
                    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</p>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {visible.map(({ label, value, mono }) => (
                          <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                            <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</span>
                            <span className={`text-right text-sm font-medium text-gray-900 dark:text-white/90 ${mono ? "break-all font-mono" : ""}`}>
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="space-y-4">
                    <Section title="Konektivitas" rows={[
                      { label: "Status", value: online ? "Online" : "Offline" },
                      { label: "Last Inform", value: formatLastInform(device._lastInform) },
                      { label: "Ping", value: ping !== "-" ? `${ping} ms` : "-" },
                      { label: "Uptime", value: uptime !== "-" ? `${Math.floor(Number(uptime) / 86400)}h ${Math.floor((Number(uptime) % 86400) / 3600)}m` : "-" },
                    ]} />

                    <Section title="Identitas Perangkat" rows={[
                      { label: "GenieACS ID", value: device._id, mono: true },
                      { label: "Pabrikan", value: manufacturer },
                      { label: "Model", value: model },
                      { label: "Serial Number", value: serial, mono: true },
                      { label: "OUI", value: oui, mono: true },
                      { label: "Hardware Version", value: hwVer },
                      { label: "Software Version", value: swVer },
                    ]} />

                    <Section title="Jaringan WAN" rows={[
                      { label: "IP Address", value: ip, mono: true },
                      { label: "MAC Address", value: mac, mono: true },
                    ]} />

                    <Section title="WLAN" rows={[
                      { label: "SSID", value: ssid },
                      { label: "Status", value: wlanEn === "true" || wlanEn === "1" ? "Aktif" : wlanEn === "false" || wlanEn === "0" ? "Nonaktif" : wlanEn },
                    ]} />

                    {lanHosts.length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            LAN Hosts ({lanHosts.length})
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-gray-800">
                                {["Hostname", "IP Address", "MAC Address", "Status"].map(h => (
                                  <th key={h} className="px-4 py-2 text-left font-semibold text-gray-400 dark:text-gray-500">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                              {lanHosts.map((h, i) => (
                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{h.hostname || <span className="text-gray-400">-</span>}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">{h.ip || "-"}</td>
                                  <td className="px-4 py-2.5 font-mono text-gray-500 dark:text-gray-400">{h.mac || "-"}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${h.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}>
                                      <span className={`h-1 w-1 rounded-full ${h.active ? "bg-green-500" : "bg-gray-400"}`} />
                                      {h.active ? "Aktif" : "Tidak"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {detailError && lanHosts.length === 0 && (
                      <p className="py-4 text-center text-xs text-gray-400">
                        Data detail tidak tersedia karena GenieACS tidak dapat dihubungi.
                      </p>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Device Row ───────────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: GenieACSDevice;
  index: number;
  startIndex: number;
  alreadyImported: boolean;
  onImport: (device: GenieACSDevice) => void;
  onDetail: (device: GenieACSDevice) => void;
  onViewMap: (device: GenieACSDevice) => void;
}

function DeviceRow({ device, index, startIndex, alreadyImported, onImport, onDetail, onViewMap }: DeviceRowProps) {
  const online = isOnline(device._lastInform);
  const { att } = extractSignal(device);
  const temp = extractTemp(device);
  const mac = extractMAC(device);
  const ip = extractIP(device);
  const ssid = extractSSID(device);
  const pppoe = extractPPPoE(device);
  const clientCount = extractLanHosts(device).length;
  const serial = extractDeviceIDField(device, "SerialNumber");
  const tipe = detectDeviceType(device);

  const tipeColors: Record<string, string> = {
    onu: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    odp: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    olt: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  };

  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/2">
      {/* SN — clickable to open detail */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <button
          onClick={() => onDetail(device)}
          className="font-mono text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
          title={device._id}
        >
          {serial !== "-" ? serial : device._id.split("-").pop()}
        </button>
      </td>
      {/* MAC */}
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">
        {mac !== "-" ? mac : <span className="text-gray-300 dark:text-gray-700">—</span>}
      </td>
      {/* TIPE */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${tipeColors[tipe]}`}>
          {tipe}
        </span>
      </td>
      {/* IP */}
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">
        {ip !== "-" ? ip : <span className="text-gray-300 dark:text-gray-700">—</span>}
      </td>
      {/* SSID */}
      <td className="max-w-[120px] truncate px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400" title={ssid !== "-" ? ssid : undefined}>
        {ssid !== "-" ? ssid : <span className="text-gray-300 dark:text-gray-700">—</span>}
      </td>
      {/* PPPoE */}
      <td className="max-w-[120px] truncate px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400" title={pppoe !== "-" ? pppoe : undefined}>
        {pppoe !== "-" ? pppoe : <span className="text-gray-300 dark:text-gray-700">—</span>}
      </td>
      {/* REDAMAN */}
      <td className="whitespace-nowrap px-3 py-2.5"><SignalCell value={att} label="Att" /></td>
      {/* TEMP */}
      <td className="whitespace-nowrap px-3 py-2.5">
        {temp !== null ? (
          <span className={`text-xs font-semibold tabular-nums ${temp > 70 ? "text-red-500" : temp > 55 ? "text-orange-500" : "text-gray-600 dark:text-gray-400"}`}>
            {temp.toFixed(0)}°C
          </span>
        ) : (
          <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
        )}
      </td>
      {/* CLIENT */}
      <td className="whitespace-nowrap px-3 py-2.5 text-center">
        <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${clientCount > 0 ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"}`}>
          {clientCount}
        </span>
      </td>
      {/* STATUS */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <StatusBadge online={online} />
      </td>
      {/* ACTION */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onViewMap(device)}
            title="Lihat di Peta"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-gray-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
          >
            <FiMap className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDetail(device)}
            title="Lihat detail"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <FiInfo className="h-3.5 w-3.5" />
          </button>
          {alreadyImported ? (
            <span className="inline-flex h-7 items-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500">
              ✓
            </span>
          ) : (
            <button
              onClick={() => onImport(device)}
              title="Daftarkan ke sistem monitoring"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
            >
              <FiDownload className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GenieACSTable() {
  const { devices, loading, error, reload } = useGenieACSDevices();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();
  const { setSelectedDevice } = useOpticalSelectionStore();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "onu" | "odp" | "olt">("all");
  const [importedFilter, setImportedFilter] = useState<"all" | "imported" | "not_imported">("all");

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // ── Settings panel ─────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ url: "", username: "", password: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // ── Import modal ───────────────────────────────────────────────────────────
  const [importDevice, setImportDevice] = useState<GenieACSDevice | null>(null);
  const [importForm, setImportForm] = useState<{
    device_type: "olt" | "odp" | "onu";
    name: string;
    odp_id?: number;
  }>({ device_type: "onu", name: "" });
  const [odpList, setOdpList] = useState<ODPSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importedNames, setImportedNames] = useState<Map<string, string>>(new Map());

  // ── Detail drawer ──────────────────────────────────────────────────────────
  const [detailDevice, setDetailDevice] = useState<GenieACSDevice | null>(null);

  // ── Load settings — reload each time panel is opened ──────────────────────
  useEffect(() => {
    if (!showSettings) return;
    setSettingsLoading(true);
    setSettingsError(null);
    OpticalApi.getGenieACSSettings()
      .then((s) => setSettingsForm((prev) => ({ ...prev, url: s.url, username: s.username })))
      .catch(() => setSettingsError("Gagal memuat pengaturan dari server."))
      .finally(() => setSettingsLoading(false));
  }, [showSettings]);

  // ── Load already-imported IDs ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      OpticalApi.listONU().catch(() => [] as OpticalDevice[]),
      OpticalApi.listOLT().catch(() => [] as OpticalDevice[]),
      OpticalApi.listODP().catch(() => [] as OpticalDevice[]),
    ]).then(([onus, olts, odps]) => {
      const ids = new Set<string>();
      const names = new Map<string, string>();
      [...onus, ...olts, ...odps].forEach((d) => {
        if (d.genieacs_id) {
          ids.add(d.genieacs_id);
          names.set(d.genieacs_id, d.name);
        }
      });
      setImportedIds(ids);
      setImportedNames(names);
    }).catch(() => {});
  }, []);

  // ── Lock scroll when import modal open ────────────────────────────────────
  useEffect(() => {
    if (!importDevice) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setImportDevice(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [importDevice]);

  // ── Lock scroll when detail drawer open ───────────────────────────────────
  useEffect(() => {
    if (!detailDevice) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, [detailDevice]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await reload();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [reload]);

  const handleSaveSettings = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await OpticalApi.updateGenieACSSettings(settingsForm);
      SweetAlert.success("Berhasil", "Pengaturan GenieACS berhasil disimpan");
      setShowSettings(false);
      handleRefresh();
    } catch {
      SweetAlert.error("Error", "Gagal menyimpan pengaturan GenieACS");
    } finally {
      setSavingSettings(false);
    }
  }, [settingsForm, handleRefresh]);

  const handleViewMap = useCallback((device: GenieACSDevice) => {
    setSelectedDevice(device);
    router.push('/map');
  }, [setSelectedDevice, router]);

  const openImportModal = useCallback(async (device: GenieACSDevice) => {
    setImportDevice(device);
    setImportForm({ device_type: detectDeviceType(device), name: "", odp_id: undefined });
    try {
      setOdpList(await OpticalApi.listODP());
    } catch {
      setOdpList([]);
    }
  }, []);

  const handleImport = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDevice) return;
    setImporting(true);
    try {
      const payload: { device_type: "olt" | "odp" | "onu"; name: string; odp_id?: number } = {
        device_type: importForm.device_type,
        name: importForm.name,
      };
      if (importForm.device_type === "onu" && importForm.odp_id) payload.odp_id = importForm.odp_id;
      await OpticalApi.importGenieACSDevice(importDevice._id, payload);
      setImportedIds((prev) => new Set([...prev, importDevice._id]));
      SweetAlert.success("Berhasil", `Perangkat berhasil didaftarkan sebagai ${importForm.device_type.toUpperCase()}`);
      setImportDevice(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) SweetAlert.error("Gagal", "Perangkat sudah terdaftar sebelumnya");
      else SweetAlert.error("Error", "Gagal mendaftarkan perangkat");
    } finally {
      setImporting(false);
    }
  }, [importDevice, importForm]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const onlineCount = useMemo(() => devices.filter((d) => isOnline(d._lastInform)).length, [devices]);
  const offlineCount = devices.length - onlineCount;
  const importedCount = useMemo(() => devices.filter((d) => importedIds.has(d._id)).length, [devices, importedIds]);

  const typeCounts = useMemo(() => ({
    onu: devices.filter((d) => detectDeviceType(d) === "onu").length,
    odp: devices.filter((d) => detectDeviceType(d) === "odp").length,
    olt: devices.filter((d) => detectDeviceType(d) === "olt").length,
  }), [devices]);

  const filtered = useMemo(() => {
    let list = devices;
    if (typeFilter !== "all") list = list.filter((d) => detectDeviceType(d) === typeFilter);
    if (statusFilter === "online") list = list.filter((d) => isOnline(d._lastInform));
    else if (statusFilter === "offline") list = list.filter((d) => !isOnline(d._lastInform));
    if (importedFilter === "imported") list = list.filter((d) => importedIds.has(d._id));
    else if (importedFilter === "not_imported") list = list.filter((d) => !importedIds.has(d._id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((d) =>
        d._id.toLowerCase().includes(q) ||
        extractDeviceIDField(d, "SerialNumber").toLowerCase().includes(q) ||
        extractDeviceIDField(d, "Manufacturer").toLowerCase().includes(q) ||
        extractDeviceIDField(d, "ProductClass").toLowerCase().includes(q)
      );
    }
    return list;
  }, [devices, statusFilter, typeFilter, importedFilter, searchQuery, importedIds]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayed = filtered.slice(startIndex, startIndex + itemsPerPage);

  const hasFilter = statusFilter !== "all" || typeFilter !== "all" || importedFilter !== "all" || !!searchQuery.trim();

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) for (let i = 1; i <= totalPages; i++) pages.push(i);
    else if (currentPage <= 3) pages.push(1, 2, 3, 4, "...", totalPages);
    else if (currentPage >= totalPages - 2) pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    else pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    return pages;
  }, [totalPages, currentPage]);

  const setFilter = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (val: T) => {
    setter(val);
    setCurrentPage(1);
  }, []);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-700 dark:bg-red-900/20">
          <FiWifiOff className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
          <div className="flex-1 text-sm text-red-700 dark:text-red-400">
            <span className="font-semibold">Gagal terhubung ke GenieACS.</span>{" "}
            {error} — Periksa pengaturan koneksi atau pastikan server GenieACS aktif.
          </div>
          <button
            onClick={handleRefresh}
            className="shrink-0 text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ── Filter Bar: search + extra filters ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="relative min-w-[200px] flex-1">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari Serial Number atau MAC Address..."
            value={searchQuery}
            onChange={(e) => setFilter(setSearchQuery)(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
          {searchQuery && (
            <button onClick={() => setFilter(setSearchQuery)("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <FiX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setFilter(setStatusFilter)(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">Semua Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>

        <select
          value={importedFilter}
          onChange={(e) => setFilter(setImportedFilter)(e.target.value as typeof importedFilter)}
          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">Semua Pendaftaran</option>
          <option value="not_imported">Belum Terdaftar</option>
          <option value="imported">Sudah Terdaftar</option>
        </select>

        {hasFilter && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
              setImportedFilter("all");
              setSearchQuery("");
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${showSettings
                ? "bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                : "border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
          >
            <FiSettings className="h-3.5 w-3.5" />
            Pengaturan
          </button>
        </div>
      </div>

      {/* ── Settings Panel ───────────────────────────────────────────────── */}
      {showSettings && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pengaturan Koneksi GenieACS</h3>
            {settingsLoading && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <FiRefreshCw className="h-3 w-3 animate-spin" /> Memuat...
              </span>
            )}
            {settingsError && !settingsLoading && (
              <span className="text-xs text-red-500 dark:text-red-400">{settingsError}</span>
            )}
          </div>
          <form onSubmit={handleSaveSettings} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">URL GenieACS NBI</label>
              <input type="text" value={settingsForm.url} onChange={(e) => setSettingsForm({ ...settingsForm, url: e.target.value })}
                placeholder="http://localhost:7557" required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Username</label>
              <input type="text" value={settingsForm.username} onChange={(e) => setSettingsForm({ ...settingsForm, username: e.target.value })}
                placeholder="Opsional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Password</label>
              <input type="password" value={settingsForm.password} onChange={(e) => setSettingsForm({ ...settingsForm, password: e.target.value })}
                placeholder="Kosongkan jika tidak berubah"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
            </div>
            <button type="submit" disabled={savingSettings}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-700">
              {savingSettings ? "Menyimpan..." : "Simpan"}
            </button>
          </form>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {/* Table Header — DHCP style */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Perangkat GenieACS
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">{onlineCount} Online</span>
                {offlineCount > 0 && <span className="ml-2 text-gray-500">• {offlineCount} Offline</span>}
                {importedCount > 0 && <span className="ml-2 text-brand-600 dark:text-brand-400">• {importedCount} Terdaftar</span>}
                <span className="ml-2 text-gray-400">Total: {devices.length}</span>
                {hasFilter && filtered.length !== devices.length && (
                  <span className="ml-2 text-gray-400">(difilter: {filtered.length})</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Muat Ulang
            </button>
          </div>
        </div>

        {/* Type Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50/50 px-4 py-2 dark:border-gray-800 dark:bg-gray-800/20">
          {([
            { key: "all", label: "Semua", count: devices.length },
            { key: "onu", label: "ONU", count: typeCounts.onu },
            { key: "odp", label: "ODP", count: typeCounts.odp },
            { key: "olt", label: "OLT", count: typeCounts.olt },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setFilter(setTypeFilter)(key); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === key
                  ? "bg-brand-500 text-white dark:bg-brand-600"
                  : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                typeFilter === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {count}
              </span>
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} item
          </span>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                {[
                  { label: "SN", cls: "min-w-[110px]" },
                  { label: "MAC", cls: "min-w-[130px]" },
                  { label: "TIPE", cls: "w-16" },
                  { label: "IP", cls: "min-w-[110px]" },
                  { label: "SSID", cls: "min-w-[100px]" },
                  { label: "PPPOE", cls: "min-w-[100px]" },
                  { label: "REDAMAN", cls: "w-24" },
                  { label: "TEMP", cls: "w-16" },
                  { label: "CLIENT", cls: "w-14 text-center" },
                  { label: "STATUS", cls: "w-20" },
                  { label: "AKSI", cls: "w-20 text-right" },
                ].map(({ label, cls }) => (
                  <th key={label} className={`whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${cls}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/2 transition-opacity duration-200 ${isRefreshing ? "opacity-60" : "opacity-100"}`}>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiWifiOff className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {hasFilter ? "Tidak ada perangkat yang cocok dengan filter" : "Tidak ada perangkat terdaftar di GenieACS"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayed.map((device, index) => (
                  <DeviceRow
                    key={device._id}
                    device={device}
                    index={index}
                    startIndex={startIndex}
                    alreadyImported={importedIds.has(device._id)}
                    onImport={openImportModal}
                    onDetail={(d) => { setDetailDevice(d); setSelectedDevice(d); }}
                    onViewMap={handleViewMap}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {filtered.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>{startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)} dari {filtered.length}</span>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <label className="flex items-center gap-1.5">
                <span>Per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronLeft className="h-4 w-4" />
              </button>
              {visiblePageNumbers.map((page, i) =>
                page === "..." ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
                ) : (
                  <button key={page} onClick={() => setCurrentPage(page as number)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${currentPage === page ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"}`}>
                    {page}
                  </button>
                )
              )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      {importDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">Daftarkan Perangkat GenieACS</h3>
              <button onClick={() => setImportDevice(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="mx-6 mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">GenieACS ID</span>
                <span className="max-w-[200px] truncate font-mono text-gray-800 dark:text-white" title={importDevice._id}>{importDevice._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Pabrikan</span>
                <span className="text-gray-800 dark:text-white">{extractDeviceIDField(importDevice, "Manufacturer")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Serial</span>
                <span className="font-mono text-gray-800 dark:text-white">{extractDeviceIDField(importDevice, "SerialNumber")}</span>
              </div>
            </div>
            <form onSubmit={handleImport} className="space-y-4 p-6 pt-4">
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  Tipe Perangkat
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Auto-detected</span>
                </label>
                <select value={importForm.device_type}
                  onChange={(e) => setImportForm({ ...importForm, device_type: e.target.value as "olt" | "odp" | "onu", odp_id: undefined })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                  <option value="onu">ONU / ONT</option>
                  <option value="odp">ODP</option>
                  <option value="olt">OLT</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Nama Perangkat <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={importForm.name}
                  onChange={(e) => setImportForm({ ...importForm, name: e.target.value })}
                  placeholder={importForm.device_type === "onu" ? "ONU-RT01-001" : importForm.device_type === "odp" ? "ODP-RT01-A" : "OLT-Pusat-01"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500" />
              </div>
              {importForm.device_type === "onu" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">ODP (Opsional)</label>
                  <select value={importForm.odp_id ?? ""}
                    onChange={(e) => setImportForm({ ...importForm, odp_id: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                    <option value="">-- Pilih ODP --</option>
                    {odpList.map((odp) => <option key={odp.id} value={odp.id}>{odp.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setImportDevice(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" disabled={importing}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-700">
                  {importing ? "Mendaftarkan..." : "Daftarkan Perangkat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {detailDevice && (
        <DetailDrawer
          device={detailDevice}
          importedName={importedNames.get(detailDevice._id)}
          onClose={() => setDetailDevice(null)}
        />
      )}
    </div>
  );
}
