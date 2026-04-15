"use client";

import { useEffect, useState } from "react";
import { FiX, FiCheckCircle, FiAlertTriangle, FiXCircle } from "react-icons/fi";
import { PackageApi, SyncLog, Package } from "@/lib/api/packages";

interface Props {
  pkg: Package;
  onClose: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:       <FiCheckCircle className="h-4 w-4 text-green-500" />,
  mismatch: <FiAlertTriangle className="h-4 w-4 text-yellow-500" />,
  missing:  <FiXCircle className="h-4 w-4 text-red-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  ok:       "OK",
  mismatch: "Mismatch",
  missing:  "Missing",
};

export function SyncLogModal({ pkg, onClose }: Props) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PackageApi.getSyncLogs(pkg.id, 30)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pkg.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Riwayat Sinkronisasi
            </h3>
            <p className="text-xs text-gray-400">{pkg.name} — {pkg.mikrotik_profile_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400">Memuat...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-sm text-gray-400">Belum ada log sinkronisasi</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                  <th className="pb-2 pr-3">Waktu</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Tersimpan</th>
                  <th className="pb-2">Aktual MikroTik</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 py-2 text-gray-700 dark:border-gray-800 dark:text-gray-300"
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-gray-400">
                      {new Date(log.checked_at).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1">
                        {STATUS_ICON[log.status]}
                        {STATUS_LABEL[log.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{log.stored_value || "—"}</td>
                    <td className="py-2 font-mono text-xs">{log.mikrotik_actual || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
