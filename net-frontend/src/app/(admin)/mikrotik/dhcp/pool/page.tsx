"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { DHCPApi } from "@/lib/api/dhcp";
import { useAuth } from "@/context/AuthContext";
import { SweetAlert } from "@/lib/sweetalert";
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiTrash2,
  FiSave,
  FiX,
  FiEdit2,
  FiRefreshCw,
  FiPlus,
  FiLoader,
  FiArrowLeft,
  FiDatabase,
} from "react-icons/fi";

// ─── Types ───────────────────────────────────────────────────────────────────
interface IPPool {
  name: string;
  ranges: string;
  next_pool?: string;
  used?: number;
  total?: number;
}

// ─── Pool Usage Badge ─────────────────────────────────────────────────────────
function PoolUsageBadge({ used, total }: { used?: number; total?: number }) {
  if (used === undefined || total === undefined || total === 0) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
    );
  }
  const percentage = (used / total) * 100;
  let colorClass = "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (percentage > 80) {
    colorClass = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  } else if (percentage > 50) {
    colorClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
        {used} / {total} digunakan
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full ${percentage > 80 ? "bg-red-500" : percentage > 50 ? "bg-yellow-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Pool Row ────────────────────────────────────────────────────────────────
interface PoolRowProps {
  pool: IPPool;
  index: number;
  startIndex: number;
  onEdit: (pool: IPPool) => void;
  onDelete: (poolName: string) => void;
}

const PoolRow = React.memo(function PoolRow({
  pool,
  index,
  startIndex,
  onEdit,
  onDelete,
}: PoolRowProps) {
  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {pool.name}
          </span>
          {pool.next_pool && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Next: {pool.next_pool}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
        {pool.ranges}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <PoolUsageBadge used={pool.used} total={pool.total} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(pool)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            title="Edit Pool"
          >
            <FiEdit2 className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(pool.name)}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            title="Hapus Pool"
          >
            <FiTrash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        </div>
      </td>
    </tr>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DHCPPoolPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [routers, setRouters] = React.useState<MikrotikRouter[]>([]);
  const [selectedRouterId, setSelectedRouterId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<IPPool | null>(null);
  const [formData, setFormData] = useState<{ name: string; ranges: string; next_pool: string }>({
    name: "",
    ranges: "",
    next_pool: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const [pools, setPools] = useState<IPPool[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(false);

  const activeRouters = routers.filter((r) => r.is_active);
  const selectedRouter = routers.find((r) => r.id === selectedRouterId);

  // Fetch routers
  React.useEffect(() => {
    const fetchRouters = async () => {
      try {
        const data = await MikrotikApi.findAll();
        setRouters(data);
        const active = data.filter((r) => r.is_active);
        if (active.length > 0) {
          setSelectedRouterId(active[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch routers:", error);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchRouters();
  }, [user]);

  // Fetch pools
  const fetchPools = useCallback(async () => {
    if (!selectedRouterId) return;
    setIsLoadingPools(true);
    try {
      const poolNames = await DHCPApi.getPools(selectedRouterId);
      // Try to get detailed pool info from API if available
      const poolsWithDetails: IPPool[] = poolNames.map((name) => ({
        name,
        ranges: "-",
      }));
      setPools(poolsWithDetails);
    } catch (error) {
      console.error("Failed to fetch pools:", error);
      setPools([]);
    } finally {
      setIsLoadingPools(false);
    }
  }, [selectedRouterId]);

  React.useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const smoothRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchPools();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [fetchPools]);

  const handleCloseModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingPool(null);
    setFormData({ name: "", ranges: "", next_pool: "" });
    setIsSaving(false);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setFormData({ name: "", ranges: "", next_pool: "" });
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((pool: IPPool) => {
    setEditingPool(pool);
    setFormData({ name: pool.name, ranges: pool.ranges, next_pool: pool.next_pool || "" });
    setIsEditModalOpen(true);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || isSaving) return;
    if (!formData.name || !formData.ranges) {
      SweetAlert.error("Error", "Nama dan Range IP wajib diisi");
      return;
    }

    setIsSaving(true);
    try {
      await DHCPApi.createPool(selectedRouterId, formData);
      SweetAlert.success("Berhasil", "IP Pool berhasil dibuat");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal membuat IP Pool";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !editingPool || isSaving) return;

    setIsSaving(true);
    try {
      // Note: MikroTik doesn't support editing pool name, so we delete and recreate
      // or use a dedicated update endpoint if backend supports it
      await DHCPApi.createPool(selectedRouterId, formData);
      SweetAlert.success("Berhasil", "IP Pool berhasil diperbarui");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal memperbarui IP Pool";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, editingPool, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleDelete = useCallback(async (poolName: string) => {
    if (!selectedRouterId) return;
    const result = await SweetAlert.confirm(
      "Hapus IP Pool",
      `Apakah Anda yakin ingin menghapus pool "${poolName}"?`
    );
    if (!result.isConfirmed) return;

    try {
      if ("deletePool" in DHCPApi) {
        await DHCPApi.deletePool!(selectedRouterId, poolName);
        SweetAlert.success("Berhasil", "IP Pool berhasil dihapus");
        smoothRefetch();
      } else {
        SweetAlert.error("Error", "Fitur hapus pool belum tersedia di API");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menghapus IP Pool";
      SweetAlert.error("Error", msg);
    }
  }, [selectedRouterId, smoothRefetch]);

  // ── Filter & Sort ───────────────────────────────────────────────────────────
  const filteredPools = useMemo(() => {
    let list = [...pools];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.ranges && p.ranges.toLowerCase().includes(q)) ||
          (p.next_pool && p.next_pool.toLowerCase().includes(q))
      );
    }

    return list;
  }, [pools, searchQuery]);

  const totalPages = Math.ceil(filteredPools.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedPools = filteredPools.slice(startIndex, startIndex + itemsPerPage);

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push("/mikrotik/dhcp")}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <FiArrowLeft className="h-4 w-4" />
            Kembali ke DHCP Leases
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Manajemen DHCP Pool
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Kelola IP Pool untuk alokasi alamat IP DHCP
          </p>
        </div>
      </div>

      {/* Router Selector */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Pilih Router
        </label>
        {activeRouters.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300">
            Tidak ada router aktif. Silakan aktifkan router di halaman manajemen router.
          </div>
        ) : (
          <select
            value={selectedRouterId || ""}
            onChange={(e) => {
              setSelectedRouterId(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {activeRouters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.host}:{r.port})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Cari nama pool, range IP..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <button
            onClick={smoothRefetch}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <FiRefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            <FiPlus className="h-4 w-4" />
            Tambah Pool
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <FiDatabase className="h-5 w-5 text-teal-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  IP Pools — {selectedRouter?.name || "-"}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Total: {pools.length} pool
                {filteredPools.length !== pools.length && (
                  <span className="ml-2 text-gray-400">(difilter: {filteredPools.length})</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nama Pool</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Range IP</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Penggunaan</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {isLoadingPools && pools.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredPools.length > 0 ? (
                displayedPools.map((pool, index) => (
                  <PoolRow
                    key={pool.name}
                    pool={pool}
                    index={index}
                    startIndex={startIndex}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiDatabase className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {searchQuery
                          ? "Tidak ada pool yang cocok dengan pencarian"
                          : "Tidak ada IP Pool"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredPools.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredPools.length)} dari {filteredPools.length}
              </span>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1.5">
                <span>Per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {[50, 100, 250, 500, 1000].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
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
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      currentPage === page
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}>
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

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Tambah IP Pool
              </h3>
              <button type="button" onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Pool <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="dhcp_pool1"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Range IP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ranges}
                    onChange={(e) => setFormData({ ...formData, ranges: e.target.value })}
                    placeholder="192.168.1.100-192.168.1.200"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-400">Format: 192.168.1.100-192.168.1.200</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Next Pool <span className="text-xs font-normal text-gray-400">(opsional)</span>
                  </label>
                  <select
                    value={formData.next_pool}
                    onChange={(e) => setFormData({ ...formData, next_pool: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">— Tidak Ada —</option>
                    {pools.filter(p => p.name !== formData.name).map((pool) => (
                      <option key={pool.name} value={pool.name}>{pool.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Pool cadangan jika pool ini penuh</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan Pool</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingPool && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit IP Pool
              </h3>
              <button type="button" onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Pool
                  </label>
                  <input
                    type="text"
                    value={editingPool.name}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">Nama pool tidak dapat diubah</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Range IP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ranges}
                    onChange={(e) => setFormData({ ...formData, ranges: e.target.value })}
                    placeholder="192.168.1.100-192.168.1.200"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Next Pool <span className="text-xs font-normal text-gray-400">(opsional)</span>
                  </label>
                  <select
                    value={formData.next_pool}
                    onChange={(e) => setFormData({ ...formData, next_pool: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">— Tidak Ada —</option>
                    {pools.filter(p => p.name !== editingPool.name).map((pool) => (
                      <option key={pool.name} value={pool.name}>{pool.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan Perubahan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
