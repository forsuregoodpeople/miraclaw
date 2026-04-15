"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FiPlus, FiRefreshCw, FiEdit2, FiTrash2, FiList,
  FiAlertTriangle, FiCheckCircle, FiXCircle,
} from "react-icons/fi";
import { PackageApi, Package } from "@/lib/api/packages";
import { MikrotikApi, MikrotikRouter } from "@/lib/api/mikrotik";
import { SweetAlert } from "@/lib/sweetalert";
import { PackageModal } from "./PackageModal";
import { SyncLogModal } from "./SyncLogModal";

const TYPE_BADGE: Record<string, string> = {
  PPPOE:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DHCP:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const SYNC_BADGE: Record<string, string> = {
  ok:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  mismatch: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  missing:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "":       "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const SYNC_ICON: Record<string, React.ReactNode> = {
  ok:       <FiCheckCircle className="h-3.5 w-3.5" />,
  mismatch: <FiAlertTriangle className="h-3.5 w-3.5" />,
  missing:  <FiXCircle className="h-3.5 w-3.5" />,
  "":       null,
};

type Tab = "ALL" | "PPPOE" | "DHCP" | "STATIC";
const TABS: Tab[] = ["ALL", "PPPOE", "DHCP", "STATIC"];

export function PackageManagementClient() {
  const [packages, setPackages]         = useState<Package[]>([]);
  const [routers, setRouters]           = useState<MikrotikRouter[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<number>(0);
  const [activeTab, setActiveTab]       = useState<Tab>("ALL");
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);

  const [showModal, setShowModal]       = useState(false);
  const [editPkg, setEditPkg]           = useState<Package | undefined>();
  const [syncLogPkg, setSyncLogPkg]     = useState<Package | undefined>();

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const data = await PackageApi.getAll(selectedRouter > 0 ? { router_id: selectedRouter } : {});
      setPackages(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    MikrotikApi.findAll().then(setRouters).catch(() => {});
  }, []);

  useEffect(() => {
    fetchPackages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouter]);

  const hasMismatch = packages.some(
    (p) => p.last_sync_status === "mismatch" || p.last_sync_status === "missing"
  );

  const filtered = useMemo(() => {
    if (activeTab === "ALL") return packages;
    return packages.filter((p) => p.connection_type === activeTab);
  }, [packages, activeTab]);

  const tabCount = (tab: Tab) =>
    tab === "ALL" ? packages.length : packages.filter((p) => p.connection_type === tab).length;

  const handleSync = async () => {
    if (selectedRouter <= 0) {
      SweetAlert.error("Pilih Router", "Pilih router terlebih dahulu untuk sinkronisasi");
      return;
    }
    setSyncing(true);
    try {
      const result = await PackageApi.syncImport(selectedRouter);
      await SweetAlert.success(
        "Sinkronisasi Selesai",
        `+${result.created} baru, ${result.updated} diperbarui${result.inactive > 0 ? `, ${result.inactive} dinonaktifkan` : ""}`
      );
      await fetchPackages();
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Sinkronisasi gagal");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (pkg: Package) => {
    const confirmed = await SweetAlert.confirm(
      "Hapus Paket",
      `Yakin ingin menghapus paket "${pkg.name}"?`
    );
    if (!confirmed) return;
    try {
      await PackageApi.delete(pkg.id);
      await SweetAlert.success("Berhasil", "Paket berhasil dihapus");
      await fetchPackages();
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Gagal menghapus paket");
    }
  };

  const openCreate = () => { setEditPkg(undefined); setShowModal(true); };
  const openEdit   = (pkg: Package) => { setEditPkg(pkg); setShowModal(true); };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Mismatch warning banner */}
      {hasMismatch && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300">
          <FiAlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Configuration mismatch detected</strong> — Beberapa profil MikroTik tidak sesuai
            dengan konfigurasi yang tersimpan. Periksa kolom Sync di bawah.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedRouter}
            onChange={(e) => setSelectedRouter(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            <option value={0}>Semua Router</option>
            {routers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing || selectedRouter <= 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <FiRefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Menyinkronkan..." : "Sinkronisasi"}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            <FiPlus className="h-4 w-4" />
            Tambah Paket
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {tab}
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {tabCount(tab)}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nama Paket</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tipe</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Router</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Profil MikroTik</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Sync</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                      <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 140 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-2 md:px-6 md:py-4">
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <FiAlertTriangle className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Belum ada paket{activeTab !== "ALL" ? ` untuk tipe ${activeTab}` : ""}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((pkg, index) => {
                const router = routers.find((r) => r.id === pkg.router_id);
                const syncStatus = pkg.last_sync_status ?? "";
                return (
                  <tr key={pkg.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/2">
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white/90">{pkg.name}</span>
                        {pkg.description && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{pkg.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_BADGE[pkg.connection_type]}`}>
                        {pkg.connection_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      {router?.name ?? `#${pkg.router_id}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 font-mono text-xs text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {pkg.mikrotik_profile_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      {syncStatus ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${SYNC_BADGE[syncStatus]}`}>
                          {SYNC_ICON[syncStatus]}
                          {syncStatus.charAt(0).toUpperCase() + syncStatus.slice(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSyncLogPkg(pkg)}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                          title="Riwayat Sync"
                        >
                          <FiList className="h-3 w-3" />
                          <span className="hidden sm:inline">Log</span>
                        </button>
                        <button
                          onClick={() => openEdit(pkg)}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                          title="Edit"
                        >
                          <FiEdit2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(pkg)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                          title="Hapus"
                        >
                          <FiTrash2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Hapus</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <PackageModal
          package={editPkg}
          onClose={() => setShowModal(false)}
          onSaved={fetchPackages}
        />
      )}

      {syncLogPkg && (
        <SyncLogModal
          pkg={syncLogPkg}
          onClose={() => setSyncLogPkg(undefined)}
        />
      )}
    </div>
  );
}
