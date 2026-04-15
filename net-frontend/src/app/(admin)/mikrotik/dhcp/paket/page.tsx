"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { DHCPApi, DHCPServer } from "@/lib/api/dhcp";
import { useAuth } from "@/context/AuthContext";
import { useDHCPServers } from "@/lib/hooks/useDHCPServers";
import { useRouterInterfaces } from "@/lib/hooks/useRouterInterfaces";
import { InterfaceSelect } from "@/components/mikrotik/shared/InterfaceSelect";
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
  FiServer,
} from "react-icons/fi";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Pool {
  name: string;
  ranges: string;
  next_pool?: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        AKTIF
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      NONAKTIF
    </span>
  );
}

// ─── Server Row ───────────────────────────────────────────────────────────────
interface ServerRowProps {
  server: DHCPServer & { id?: number; disabled?: boolean };
  index: number;
  startIndex: number;
  onEdit: (server: DHCPServer & { id?: number; disabled?: boolean }) => void;
  onDelete: (serverName: string) => void;
}

const ServerRow = React.memo(function ServerRow({
  server,
  index,
  startIndex,
  onEdit,
  onDelete,
}: ServerRowProps) {
  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {server.name}
          </span>
          {server.lease_time && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Lease: {server.lease_time}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
        {server.interface || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
        {server.address_pool ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {server.address_pool}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <StatusBadge isActive={!server.disabled} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(server)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            title="Edit Server"
          >
            <FiEdit2 className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(server.name)}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            title="Hapus Server"
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
export default function DHCPServerPage() {
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
  const [editingServer, setEditingServer] = useState<(DHCPServer & { id?: number; disabled?: boolean }) | null>(null);
  const [formData, setFormData] = useState<Partial<DHCPServer>>({
    name: "",
    interface: "",
    address_pool: "",
    lease_time: "10m",
  });
  const [isSaving, setIsSaving] = useState(false);

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

  // Fetch DHCP servers
  const { data: servers = [], isLoading: isLoadingServers, refetch: refetchServers } = useDHCPServers({
    routerId: selectedRouterId || 0,
    enabled: !!selectedRouterId,
  });

  // Fetch router interfaces
  const { data: routerInterfaces, isLoading: isLoadingInterfaces } = useRouterInterfaces({
    routerId: selectedRouterId || 0,
    enabled: !!selectedRouterId && isCreateModalOpen,
  });

  // Fetch pools for dropdown
  const [availablePools, setAvailablePools] = useState<string[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  React.useEffect(() => {
    if (!selectedRouterId || !isCreateModalOpen) return;
    setIsLoadingPools(true);
    DHCPApi.getPools(selectedRouterId)
      .then(setAvailablePools)
      .catch(() => setAvailablePools([]))
      .finally(() => setIsLoadingPools(false));
  }, [selectedRouterId, isCreateModalOpen]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const smoothRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchServers();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refetchServers]);

  const handleCloseModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingServer(null);
    setFormData({ name: "", interface: "", address_pool: "", lease_time: "10m" });
    setIsSaving(false);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setFormData({ name: "", interface: "", address_pool: "", lease_time: "10m" });
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((server: DHCPServer & { id?: number; disabled?: boolean }) => {
    setEditingServer(server);
    setFormData({ ...server });
    setIsEditModalOpen(true);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || isSaving) return;
    if (!formData.name || !formData.interface) {
      SweetAlert.error("Error", "Nama dan Interface server harus diisi");
      return;
    }

    setIsSaving(true);
    try {
      await DHCPApi.createServer(selectedRouterId, formData);
      SweetAlert.success("Berhasil", "DHCP Server berhasil ditambahkan");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menambahkan DHCP server";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !editingServer || isSaving) return;

    setIsSaving(true);
    try {
      await DHCPApi.createServer(selectedRouterId, { ...formData, name: editingServer.name });
      SweetAlert.success("Berhasil", "DHCP Server berhasil diperbarui");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal memperbarui DHCP server";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, editingServer, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleDelete = useCallback(async (serverName: string) => {
    if (!selectedRouterId) return;
    const result = await SweetAlert.confirm(
      "Hapus DHCP Server",
      `Apakah Anda yakin ingin menghapus server "${serverName}"?`
    );
    if (!result.isConfirmed) return;

    try {
      if ("deleteServer" in DHCPApi) {
        await DHCPApi.deleteServer!(selectedRouterId, serverName);
        SweetAlert.success("Berhasil", "DHCP Server berhasil dihapus");
        smoothRefetch();
      } else {
        SweetAlert.error("Error", "Fitur hapus server belum tersedia di API");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menghapus DHCP server";
      SweetAlert.error("Error", msg);
    }
  }, [selectedRouterId, smoothRefetch]);

  // ── Filter & Sort ───────────────────────────────────────────────────────────
  const filteredServers = useMemo(() => {
    let list = [...servers];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.interface && s.interface.toLowerCase().includes(q)) ||
          (s.address_pool && s.address_pool.toLowerCase().includes(q))
      );
    }

    return list;
  }, [servers, searchQuery]);

  const totalPages = Math.ceil(filteredServers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedServers = filteredServers.slice(startIndex, startIndex + itemsPerPage);

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
            Manajemen DHCP Paket (Server)
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Kelola profile DHCP server untuk setiap interface
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
              placeholder="Cari nama, interface, pool..."
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            <FiPlus className="h-4 w-4" />
            Tambah Paket
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <FiServer className="h-5 w-5 text-indigo-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  DHCP Servers — {selectedRouter?.name || "-"}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Total: {servers.length} server
                {filteredServers.length !== servers.length && (
                  <span className="ml-2 text-gray-400">(difilter: {filteredServers.length})</span>
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
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nama Server</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Interface</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Address Pool</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {isLoadingServers && servers.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredServers.length > 0 ? (
                displayedServers.map((server, index) => (
                  <ServerRow
                    key={server.name}
                    server={server}
                    index={index}
                    startIndex={startIndex}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiServer className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {searchQuery
                          ? "Tidak ada server yang cocok dengan pencarian"
                          : "Tidak ada DHCP server"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredServers.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredServers.length)} dari {filteredServers.length}
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
                Tambah DHCP Paket (Server)
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
                    Nama Profile/Server <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="dhcp1"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Interface <span className="text-red-500">*</span>
                  </label>
                  <InterfaceSelect
                    value={formData.interface || ""}
                    onChange={(v) => setFormData({ ...formData, interface: v })}
                    interfaces={routerInterfaces}
                    isLoading={isLoadingInterfaces}
                    error={null}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Address Pool
                  </label>
                  {isLoadingPools ? (
                    <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
                  ) : (
                    <select
                      value={formData.address_pool || ""}
                      onChange={(e) => setFormData({ ...formData, address_pool: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">— Pilih Pool (opsional) —</option>
                      {availablePools.map((pool) => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lease Time
                  </label>
                  <input
                    type="text"
                    value={formData.lease_time || ""}
                    onChange={(e) => setFormData({ ...formData, lease_time: e.target.value })}
                    placeholder="10m"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-400">Format: 10m, 1h, 1d</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingServer && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit DHCP Paket
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
                    Nama Profile/Server
                  </label>
                  <input
                    type="text"
                    value={editingServer.name}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">Nama server tidak dapat diubah</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Interface <span className="text-red-500">*</span>
                  </label>
                  <InterfaceSelect
                    value={formData.interface || ""}
                    onChange={(v) => setFormData({ ...formData, interface: v })}
                    interfaces={routerInterfaces}
                    isLoading={isLoadingInterfaces}
                    error={null}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Address Pool
                  </label>
                  {isLoadingPools ? (
                    <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
                  ) : (
                    <select
                      value={formData.address_pool || ""}
                      onChange={(e) => setFormData({ ...formData, address_pool: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">— Pilih Pool (opsional) —</option>
                      {availablePools.map((pool) => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lease Time
                  </label>
                  <input
                    type="text"
                    value={formData.lease_time || ""}
                    onChange={(e) => setFormData({ ...formData, lease_time: e.target.value })}
                    placeholder="10m"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700">
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
