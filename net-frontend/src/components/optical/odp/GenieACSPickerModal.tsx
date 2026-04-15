"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX, FiSearch, FiRefreshCw, FiCpu, FiWifi, FiWifiOff } from "react-icons/fi";
import { useGenieACSDevices } from "@/lib/hooks/useGenieACSDevices";
import type { GenieACSDevice } from "@/types/optical.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSerial(device: GenieACSDevice): string {
  const deviceId = device._deviceId as Record<string, string | undefined> | undefined;
  return deviceId?._SerialNumber ?? "-";
}

function getManufacturer(device: GenieACSDevice): string {
  const deviceId = device._deviceId as Record<string, string | undefined> | undefined;
  const name = deviceId?._Manufacturer ?? "-";
  if (!name || name === "-") return name;
  const lower = name.toLowerCase();
  if (lower.includes("huawei")) return "Huawei";
  if (lower.includes("zte")) return "ZTE";
  if (lower.includes("fiberhome") || lower.includes("fiber home")) return "FiberHome";
  if (lower.includes("tp-link") || lower.includes("tplink")) return "TP-Link";
  return name.split(/[\s,]/)[0];
}

function getProductClass(device: GenieACSDevice): string {
  const deviceId = device._deviceId as Record<string, string | undefined> | undefined;
  return deviceId?._ProductClass ?? "-";
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (serial: string, genieacsId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenieACSPickerModal({ isOpen, onClose, onSelect }: Props) {
  const { devices, loading, error, reload } = useGenieACSDevices();
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) => {
      const serial = getSerial(d).toLowerCase();
      const mfr = getManufacturer(d).toLowerCase();
      const product = getProductClass(d).toLowerCase();
      return serial.includes(q) || mfr.includes(q) || product.includes(q);
    });
  }, [devices, search]);

  const handleRowClick = (device: GenieACSDevice) => {
    const serial = getSerial(device);
    if (!serial || serial === "-") return;
    onSelect(serial, device._id);
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        style={{ maxHeight: "75vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FiCpu className="h-5 w-5 text-brand-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Pilih Perangkat GenieACS
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari serial, manufaktur, atau model..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
            />
          </div>
          <button
            onClick={reload}
            disabled={loading}
            title="Refresh"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <FiWifiOff className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400 dark:text-gray-500">{error}</p>
              <button
                onClick={reload}
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                Coba Lagi
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {search ? "Tidak ada perangkat yang cocok" : "Tidak ada perangkat GenieACS"}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Serial Number
                  </th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Manufaktur
                  </th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    Model
                  </th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    Last Inform
                  </th>
                  <th className="py-3 pr-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/2">
                {filtered.map((device) => {
                  const serial = getSerial(device);
                  const online = isOnline(device._lastInform);
                  const noSerial = !serial || serial === "-";
                  return (
                    <tr
                      key={device._id}
                      onClick={() => handleRowClick(device)}
                      className={`transition-colors ${
                        noSerial
                          ? "cursor-not-allowed opacity-40"
                          : "cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/10"
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-medium text-gray-800 dark:text-white/90">
                          {serial}
                        </div>
                        <div className="text-xs text-gray-400 truncate max-w-[160px]" title={device._id}>
                          {device._id}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                        {getManufacturer(device)}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {getProductClass(device)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400 hidden sm:table-cell">
                        {formatLastInform(device._lastInform)}
                      </td>
                      <td className="py-3 pr-5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            online
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                          }`}
                        >
                          {online ? <FiWifi className="h-3 w-3" /> : <FiWifiOff className="h-3 w-3" />}
                          {online ? "Online" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <span className="text-xs text-gray-400">
            {!loading && !error
              ? `${filtered.length} perangkat${search ? ` dari ${devices.length}` : ""}`
              : ""}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
