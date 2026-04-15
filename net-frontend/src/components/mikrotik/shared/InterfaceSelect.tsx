"use client";

import { InterfaceData } from "@/lib/api/mikrotik";
import { FiAlertCircle, FiLoader } from "react-icons/fi";

interface InterfaceSelectProps {
  value: string;
  onChange: (value: string) => void;
  interfaces: InterfaceData[];
  isLoading: boolean;
  error: string | null;
  required?: boolean;
  /** Extra class name for the select element */
  className?: string;
}

/**
 * Reusable interface <select> for DHCP and Static/Hotspot server modals.
 * Shows a spinner while loading, an error banner if the fetch failed, and
 * falls back to a free-text input so the user is never blocked.
 */
export function InterfaceSelect({
  value,
  onChange,
  interfaces,
  isLoading,
  error,
  required = false,
  className,
}: InterfaceSelectProps) {
  const baseClass =
    "w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white " +
    (error
      ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-600"
      : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
        <FiLoader className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
        <span>Memuat interface...</span>
      </div>
    );
  }

  if (error) {
    // Fetch failed — show error hint then fall back to free-text so user isn't blocked
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <FiAlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Gagal memuat interface. Ketik nama secara manual.</span>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="bridge1"
          required={required}
          className={`${baseClass} ${className ?? ""}`}
        />
      </div>
    );
  }

  // Sort: put running interfaces first, then alphabetically
  const sorted = [...interfaces].sort((a, b) => {
    const aRunning = a.running === true || a.running === "true";
    const bRunning = b.running === true || b.running === "true";
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={`${baseClass} ${className ?? ""}`}
    >
      <option value="">-- Pilih Interface --</option>
      {sorted.map((iface) => {
        const isRunning = iface.running === true || iface.running === "true";
        const isDisabled = iface.disabled === true || iface.disabled === "true";
        return (
          <option key={iface.name} value={iface.name}>
            {iface.name}
            {iface.type ? ` (${iface.type})` : ""}
            {isDisabled ? " — nonaktif" : !isRunning ? " — terputus" : ""}
          </option>
        );
      })}
    </select>
  );
}
