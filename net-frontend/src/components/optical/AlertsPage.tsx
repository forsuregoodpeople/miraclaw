"use client";

import React, { useState, useEffect, useCallback } from "react";
import { FiRefreshCw, FiAlertTriangle, FiCheckCircle, FiFilter } from "react-icons/fi";
import { OpticalApi } from "@/lib/api/genieacs";
import type { OpticalAlert, OpticalSeverity } from "@/types/optical.types";

type TabFilter = "all" | "active" | "resolved";

function SeverityBadge({ severity }: { severity: OpticalSeverity }) {
  const styles: Record<OpticalSeverity, string> = {
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  };
  const labels: Record<OpticalSeverity, string> = {
    critical: "Kritis",
    warning: "Peringatan",
    info: "Info",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${styles[severity]}`}>
      <FiAlertTriangle className="h-3 w-3" />
      {labels[severity]}
    </span>
  );
}

function AlertTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    rx_below_threshold: "RX Lemah",
    odp_fault_suspected: "Gangguan ODP",
    device_unreachable: "Tidak Terjangkau",
    tx_below_threshold: "TX Lemah",
  };
  return <span className="text-gray-700 dark:text-gray-300">{labels[type] ?? type}</span>;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString("id-ID");
  } catch {
    return d;
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<OpticalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>("active");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await OpticalApi.listAlerts();
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data alert");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      await OpticalApi.resolveAlert(id);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, resolved_at: new Date().toISOString() } : a
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyelesaikan alert");
    } finally {
      setResolvingId(null);
    }
  };

  const filtered = alerts.filter((a) => {
    if (tab === "active") return !a.resolved_at;
    if (tab === "resolved") return !!a.resolved_at;
    return true;
  });

  const activeCount = alerts.filter((a) => !a.resolved_at).length;
  const resolvedCount = alerts.filter((a) => !!a.resolved_at).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white/90">Alert Jaringan Optik</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Notifikasi gangguan sinyal dan perangkat
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <FiRefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Muat Ulang
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/10">
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{activeCount}</div>
          <div className="text-sm text-red-600 dark:text-red-400">Alert Aktif</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/10">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">{resolvedCount}</div>
          <div className="text-sm text-green-600 dark:text-green-400">Diselesaikan</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{alerts.length}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Alert</div>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit dark:border-gray-700 dark:bg-gray-800">
        {(["active", "resolved", "all"] as TabFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t === "active" ? "Aktif" : t === "resolved" ? "Selesai" : "Semua"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className={`overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 transition-opacity duration-200 ${isRefreshing ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">No</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tipe</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Severity</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pesan</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">RX Power</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Terakhir Terdeteksi</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-white/[0.03]">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  {tab === "active" ? "Tidak ada alert aktif" : "Tidak ada data"}
                </td>
              </tr>
            ) : (
              filtered.map((alert, index) => (
                <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-6 py-4 text-gray-900 dark:text-white/90">{index + 1}</td>
                  <td className="px-6 py-4"><AlertTypeLabel type={alert.alert_type} /></td>
                  <td className="px-6 py-4"><SeverityBadge severity={alert.severity} /></td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 max-w-xs">{alert.message}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    {alert.rx_power != null ? `${alert.rx_power.toFixed(2)} dBm` : "-"}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">{formatDate(alert.last_seen_at)}</td>
                  <td className="px-6 py-4">
                    {alert.resolved_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        <FiCheckCircle className="h-3 w-3" />
                        Selesai
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                        <FiAlertTriangle className="h-3 w-3" />
                        Aktif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!alert.resolved_at && (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolvingId === alert.id}
                        className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        {resolvingId === alert.id ? "..." : "Selesaikan"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
