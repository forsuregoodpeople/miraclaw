import { FiRefreshCw } from "react-icons/fi";
import { Tab, TableCounts, StatusFilter } from "../types";

interface TableHeaderProps {
  routerName?: string;
  isRefreshing: boolean;
  syncingPelanggan: boolean;
  syncingCustomers: boolean;
  data: { length: number };
  upCount: number;
  downCount: number;
  isolirCount: number;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  activeTab: Tab;
  setActiveTab: (v: Tab) => void;
  counts: TableCounts;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "DHCP", label: "DHCP" },
  { key: "PPPOE", label: "PPPoE" },
  { key: "STATIC", label: "Static" },
];

export function TableHeader({
  routerName,
  isRefreshing,
  syncingPelanggan,
  syncingCustomers,
  data,
  upCount,
  downCount,
  isolirCount,
  statusFilter,
  setStatusFilter,
  activeTab,
  setActiveTab,
  counts,
}: TableHeaderProps) {
  return (
    <div className="border-b border-gray-200 bg-gray-50 px-2 py-2 dark:border-gray-800 dark:bg-gray-900/60 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Daftar Pelanggan{routerName ? ` — ${routerName}` : ""}
            </h2>
            {(isRefreshing || syncingCustomers || syncingPelanggan) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <FiRefreshCw className="h-3 w-3 animate-spin" />
                <span>{syncingPelanggan ? "Sync dari MikroTik..." : syncingCustomers && !isRefreshing ? "Sinkronisasi pelanggan..." : "Memperbarui..."}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setStatusFilter(statusFilter === "up" ? "all" : "up")}
              title={statusFilter === "up" ? "Klik untuk hapus filter Aktif" : "Klik untuk filter hanya Aktif"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                statusFilter === "up"
                  ? "border-green-400 bg-green-100 text-green-700 ring-1 ring-green-400 dark:border-green-500 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-500"
                  : "border-green-200 bg-green-50 text-green-600 hover:border-green-400 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:border-green-600"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {upCount} Aktif
              {statusFilter === "up" && <span className="ml-0.5 text-green-500 dark:text-green-400">×</span>}
            </button>

            {(downCount > 0 || statusFilter === "down") && (
              <button
                onClick={() => setStatusFilter(statusFilter === "down" ? "all" : "down")}
                title={statusFilter === "down" ? "Klik untuk hapus filter Putus" : "Klik untuk filter hanya Putus"}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                  statusFilter === "down"
                    ? "border-orange-400 bg-orange-100 text-orange-700 ring-1 ring-orange-400 dark:border-orange-500 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-500"
                    : "border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-400 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:border-orange-600"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {downCount} Putus
                {statusFilter === "down" && <span className="ml-0.5 text-orange-500 dark:text-orange-400">×</span>}
              </button>
            )}

            {(isolirCount > 0 || statusFilter === "isolir") && (
              <button
                onClick={() => setStatusFilter(statusFilter === "isolir" ? "all" : "isolir")}
                title={statusFilter === "isolir" ? "Klik untuk hapus filter Terisolir" : "Klik untuk filter hanya Terisolir"}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                  statusFilter === "isolir"
                    ? "border-red-400 bg-red-100 text-red-700 ring-1 ring-red-400 dark:border-red-500 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-500"
                    : "border-red-200 bg-red-50 text-red-600 hover:border-red-400 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:border-red-600"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {isolirCount} Terisolir
                {statusFilter === "isolir" && <span className="ml-0.5 text-red-500 dark:text-red-400">×</span>}
              </button>
            )}

            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-500">
              Total {data.length}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="hidden items-center gap-1 sm:flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-brand-500 text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === key
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
