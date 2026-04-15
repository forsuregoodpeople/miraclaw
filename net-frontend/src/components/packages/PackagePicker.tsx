"use client";

import { FiAlertTriangle } from "react-icons/fi";
import { usePackages } from "@/lib/hooks/usePackages";

interface Props {
  routerId: number;
  connectionType: "PPPOE" | "DHCP" | "STATIC";
  value: number | null;
  onChange: (packageId: number | null) => void;
  disabled?: boolean;
}

export function PackagePicker({ routerId, connectionType, value, onChange, disabled }: Props) {
  const { data: packages, isLoading, error } = usePackages({
    routerId,
    type: connectionType,
    enabled: routerId > 0,
  });

  const selected = packages.find((p) => p.id === value);
  const hasMismatch = selected?.last_sync_status === "mismatch" || selected?.last_sync_status === "missing";
  const noRouter = routerId <= 0;

  return (
    <div className="space-y-1">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled || isLoading || noRouter}
        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
      >
        <option value="">
          {noRouter ? "— Router tidak ditemukan —" : isLoading ? "Memuat paket..." : "— Pilih Paket —"}
        </option>
        {packages.map((pkg) => (
          <option key={pkg.id} value={pkg.id}>
            {pkg.name}
            {pkg.last_sync_status === "mismatch" || pkg.last_sync_status === "missing"
              ? " ⚠️"
              : ""}
          </option>
        ))}
      </select>

      {!noRouter && !isLoading && !error && packages.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Belum ada paket tersedia — sync dari MikroTik terlebih dahulu
        </p>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {hasMismatch && (
        <div className="flex items-center gap-1.5 rounded-lg bg-yellow-50 px-3 py-1.5 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
          <FiAlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Profil MikroTik tidak sesuai — konfigurasi terdeteksi berbeda
        </div>
      )}
    </div>
  );
}
