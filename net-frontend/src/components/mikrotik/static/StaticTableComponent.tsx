"use client";

import React, {
  useState,
  memo,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { StaticBinding, StaticApi, HotspotServer } from "@/lib/api/static";
import { useMikrotikStatic } from "@/lib/hooks/useMikrotikStatic";
import { useHotspotServers } from "@/lib/hooks/useHotspotServers";
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
  FiWifiOff,
  FiEdit2,
  FiRefreshCw,
  FiPlus,
  FiLoader,
  FiLock,
  FiUnlock,
  FiFilter,
  FiServer,
} from "react-icons/fi";

import { timeAgo } from "../pelanggan/components/utils/timeAgo";

// ─── Last seen parser untuk Static Binding ────────────────────────────
// Static binding menggunakan updated_at (ISO timestamp) bukan last_seen RouterOS
function parseISOToSeconds(isoString: string): number {
  if (!isoString) return Infinity;
  try {
    const date = new Date(isoString);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / 1000);
  } catch {
    return Infinity;
  }
}

function LastSeenBadge({ lastSeen }: { lastSeen: string }) {
  if (!lastSeen) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  }
  return <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{timeAgo(lastSeen)}</span>;
}

// ─── Status Badge (Up/Down) ──────────────────────────────────────────

function StatusBadge({ binding }: { binding: StaticBinding }) {
  const isBlocked = binding.is_disabled || binding.type === "blocked";

  if (isBlocked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        DOWN
      </span>
    );
  }

  if (!binding.is_online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        OFFLINE
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      UP
    </span>
  );
}

function TypeBadge({ binding }: { binding: StaticBinding }) {
  if (binding.type === "blocked") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Diblokir
      </span>
    );
  }
  if (binding.type === "bypassed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
        Bypass
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Regular
    </span>
  );
}

// ─── Binding Row ──────────────────────────────────────────────────────

interface BindingRowProps {
  binding: StaticBinding;
  index: number;
  startIndex: number;
  onBlock: (id: number) => void;
  onUnblock: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (binding: StaticBinding) => void;
  onSaveToDb: (binding: StaticBinding) => void;
}

const BindingRow = memo(function BindingRow({
  binding,
  index,
  startIndex,
  onBlock,
  onUnblock,
  onDelete,
  onEdit,
  onSaveToDb,
}: BindingRowProps) {
  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>

      {/* Mobile: Show Comment (moved from hidden), Desktop: Normal comment column */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 md:hidden">
        {binding.comment ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            {binding.comment}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden md:table-cell">
        {binding.comment ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            {binding.comment}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <StatusBadge binding={binding} />
      </td>

      {/* Mobile: Show simplified IP, Desktop: Full IP with to_address */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 max-w-[100px] md:max-w-none truncate" title={binding.address}>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {binding.address || "-"}
          </span>
          {binding.to_address && (
            <span className="hidden md:inline text-xs text-gray-400 dark:text-gray-500">
              → {binding.to_address}
            </span>
          )}
        </div>
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
        {binding.mac_address || "-"}
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">
        {binding.server || "-"}
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden lg:table-cell">
        <LastSeenBadge lastSeen={binding.last_seen || binding.updated_at} />
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden sm:table-cell">
        <TypeBadge binding={binding} />
      </td>

      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        {binding.id == null || binding.id === 0 ? (
          <button
            type="button"
            aria-label={`Simpan binding ${binding.address} ke database`}
            onClick={() => onSaveToDb(binding)}
            className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"
            title="Simpan ke Database"
          >
            <FiSave className="h-3 w-3" />
            <span className="hidden sm:inline">Simpan</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Edit binding ${binding.address}`}
              onClick={() => onEdit(binding)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <FiEdit2 className="h-3 w-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>

            {binding.type === "blocked" ? (
              <button
                type="button"
                aria-label={`Buka blokir binding ${binding.address}`}
                onClick={() => onUnblock(binding.id)}
                className="inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
              >
                <FiUnlock className="h-3 w-3" />
                <span className="hidden sm:inline">Buka Blokir</span>
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Blokir binding ${binding.address}`}
                onClick={() => onBlock(binding.id)}
                className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
              >
                <FiLock className="h-3 w-3" />
                <span className="hidden sm:inline">Blokir</span>
              </button>
            )}

            <button
              type="button"
              aria-label={`Hapus binding ${binding.address}`}
              onClick={() => onDelete(binding.id)}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              <FiTrash2 className="h-3 w-3" />
              <span className="hidden sm:inline">Hapus</span>
            </button>
          </div>
        )}
      </td>
    </tr>
  );
});

// ─── Form Fields ──────────────────────────────────────────────────────

const FORM_FIELDS = [
  { label: "Alamat IP", key: "address", placeholder: "192.168.1.100", required: true },
  { label: "MAC Address", key: "mac_address", placeholder: "AA:BB:CC:DD:EE:FF", required: true },
  { label: "Server", key: "server", placeholder: "hotspot1", required: false },
  { label: "To Address", key: "to_address", placeholder: "10.0.0.100", required: false },
  { label: "Komentar", key: "comment", placeholder: "Label pelanggan", required: false },
] as const;

// ─── Main Component ───────────────────────────────────────────────────

interface StaticTableComponentProps {
  routerId: number;
  routerName: string;
}

export function StaticTableComponent({ routerId, routerName }: StaticTableComponentProps) {
  const router = useRouter();
  const {
    data: bindings,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refetch,
    patchBinding,
    addBinding,
  } = useMikrotikStatic({ routerId, enabled: true });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "blocked" | "bypassed">("all");
  const [commentFilter, setCommentFilter] = useState<"all" | "with_comment" | "no_comment">("all");
  const [serverFilter, setServerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "ip_asc" | "ip_desc">("default");
  const [inactiveSortBy, setInactiveSortBy] = useState<"last_seen_desc" | "last_seen_asc">("last_seen_desc");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateServerModalOpen, setIsCreateServerModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<StaticBinding | null>(null);
  const [formData, setFormData] = useState<Partial<StaticBinding>>({});
  const [serverFormData, setServerFormData] = useState<Partial<HotspotServer>>({
    name: "", interface: "bridge1", profile: "default"
  });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch hotspot servers for dropdown
  const { data: hotspotServers = [], isLoading: isLoadingServers, refetch: refetchServers } = useHotspotServers({
    routerId,
    enabled: true,
  });

  // Fetch router interfaces for the Create Server modal dropdown
  const {
    data: routerInterfaces,
    isLoading: isLoadingInterfaces,
    error: interfacesError,
  } = useRouterInterfaces({ routerId, enabled: isCreateServerModalOpen });

  // Server dropdown options with fallback
  const serverOptions = useMemo(() => {
    const servers = [...hotspotServers];
    if (editingBinding?.server && editingBinding.server !== "all" && !servers.some(s => s.name === editingBinding.server)) {
      servers.push({ name: editingBinding.server, interface: "tidak dikenal" } as any);
    }
    return servers;
  }, [hotspotServers, editingBinding]);

  useEffect(() => {
    setCurrentPage(1);
    setStatusFilter("all");
    setTypeFilter("all");
    setSearchQuery("");
    setCommentFilter("all");
    setServerFilter("all");
  }, [routerId]);

  useEffect(() => {
    if (!isEditModalOpen && !isCreateModalOpen && !isCreateServerModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseModal();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [isEditModalOpen, isCreateModalOpen, isCreateServerModalOpen]);

  const smoothRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refetch]);

  const handleCloseModal = useCallback(() => {
    setIsEditModalOpen(false);
    setIsCreateModalOpen(false);
    setIsCreateServerModalOpen(false);
    setEditingBinding(null);
    setFormData({});
    setServerFormData({ name: "", interface: "bridge1", profile: "default" });
    setIsSaving(false);
  }, []);

  const handleOpenCreateBindingModal = useCallback(() => {
    setFormData({});
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenCreateServerModal = useCallback(() => {
    setServerFormData({ name: "", interface: "bridge1", profile: "default" });
    setIsCreateServerModalOpen(true);
  }, []);

  const handleSaveToDb = useCallback((binding: StaticBinding) => {
    setFormData({
      address: binding.address,
      mac_address: binding.mac_address,
      server: binding.server,
      to_address: binding.to_address,
      comment: binding.comment,
    });
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((binding: StaticBinding) => {
    setEditingBinding(binding);
    setFormData(binding);
    setIsEditModalOpen(true);
  }, []);

  const handleBlock = useCallback(async (id: number) => {
    const result = await SweetAlert.confirm(
      "Blokir Binding",
      "Apakah Anda yakin ingin memblokir binding ini?"
    );
    if (!result.isConfirmed) return;

    patchBinding(id, { type: "blocked" });
    try {
      await StaticApi.block(routerId, id);
      SweetAlert.success("Berhasil", "Binding berhasil diblokir");
      smoothRefetch();
    } catch {
      patchBinding(id, { type: "regular" });
      SweetAlert.error("Error", "Gagal memblokir binding");
    }
  }, [routerId, smoothRefetch, patchBinding]);

  const handleUnblock = useCallback(async (id: number) => {
    const result = await SweetAlert.confirm(
      "Buka Blokir Binding",
      "Apakah Anda yakin ingin membuka blokir binding ini?"
    );
    if (!result.isConfirmed) return;

    patchBinding(id, { type: "regular" });
    try {
      await StaticApi.unblock(routerId, id);
      SweetAlert.success("Berhasil", "Binding berhasil dibuka blokir");
      smoothRefetch();
    } catch {
      patchBinding(id, { type: "blocked" });
      SweetAlert.error("Error", "Gagal membuka blokir binding");
    }
  }, [routerId, smoothRefetch, patchBinding]);

  const handleDelete = useCallback(async (id: number) => {
    const result = await SweetAlert.confirm(
      "Hapus Binding",
      "Apakah Anda yakin ingin menghapus binding ini? Tindakan ini tidak dapat dibatalkan."
    );
    if (!result.isConfirmed) return;

    try {
      await StaticApi.delete(routerId, id);
      SweetAlert.success("Berhasil", "Binding berhasil dihapus");
      smoothRefetch();
    } catch {
      SweetAlert.error("Error", "Gagal menghapus binding");
    }
  }, [routerId, smoothRefetch]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBinding || isSaving) return;
    setIsSaving(true);
    patchBinding(editingBinding.id, formData);
    try {
      await StaticApi.update(routerId, editingBinding.id, { server: "all", ...formData });
      SweetAlert.success("Berhasil", "Binding berhasil diperbarui");
      handleCloseModal();
      smoothRefetch();
    } catch {
      SweetAlert.error("Error", "Gagal memperbarui binding");
    } finally {
      setIsSaving(false);
    }
  }, [editingBinding, formData, routerId, handleCloseModal, isSaving, smoothRefetch, patchBinding]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const created = await StaticApi.create(routerId, { type: "regular", server: "all", ...formData });
      addBinding(created);
      SweetAlert.success("Berhasil", "Binding berhasil ditambahkan");
      handleCloseModal();
      smoothRefetch();
    } catch {
      SweetAlert.error("Error", "Gagal menambahkan binding");
    } finally {
      setIsSaving(false);
    }
  }, [formData, routerId, handleCloseModal, isSaving, smoothRefetch, addBinding]);

  const handleCreateServer = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!serverFormData.name || !serverFormData.interface) {
      SweetAlert.error("Error", "Nama dan Interface server harus diisi");
      return;
    }

    setIsSaving(true);
    try {
      await StaticApi.createHotspotServer(routerId, serverFormData);
      SweetAlert.success("Berhasil", "Hotspot Server berhasil ditambahkan");
      handleCloseModal();
      refetchServers();
      setServerFilter("all");
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menambahkan Hotspot server";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [serverFormData, routerId, isSaving, handleCloseModal, refetchServers]);

  // ── Filter & Sort ─────────────────────────────────────────────────────────

  const filteredBindings = useMemo(() => {
    let list = bindings ?? [];

    if (statusFilter === "active") {
      list = list.filter((b) => !b.is_disabled && b.type !== "blocked");
    } else if (statusFilter === "inactive") {
      list = list.filter((b) => b.is_disabled || b.type === "blocked");
    }

    if (typeFilter !== "all") {
      list = list.filter((b) => b.type === typeFilter);
    }

    if (serverFilter !== "all") {
      list = list.filter((b) => b.server === serverFilter || (serverFilter === "all" && b.server === "all"));
    }

    if (commentFilter === "with_comment") {
      list = list.filter((b) => b.comment && b.comment.trim() !== "");
    } else if (commentFilter === "no_comment") {
      list = list.filter((b) => !b.comment || b.comment.trim() === "");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.address?.toLowerCase().includes(q) ||
          b.mac_address?.toLowerCase().includes(q) ||
          b.server?.toLowerCase().includes(q) ||
          b.comment?.toLowerCase().includes(q) ||
          b.to_address?.toLowerCase().includes(q)
      );
    }

    if (sortBy === "ip_asc" || sortBy === "ip_desc") {
      list = [...list].sort((a, b) => {
        const toNum = (ip: string) =>
          (ip || "").split(".").reduce((acc, v) => acc * 256 + Number(v), 0);
        return sortBy === "ip_asc"
          ? toNum(a.address) - toNum(b.address)
          : toNum(b.address) - toNum(a.address);
      });
    }

    // Sort inactive berdasarkan last_seen (updated_at)
    if (statusFilter === "inactive") {
      list = [...list].sort((a, b) => {
        const aS = parseISOToSeconds(a.updated_at || "");
        const bS = parseISOToSeconds(b.updated_at || "");
        return inactiveSortBy === "last_seen_desc" ? bS - aS : aS - bS;
      });
    }

    return list;
  }, [bindings, statusFilter, typeFilter, searchQuery, sortBy, inactiveSortBy, commentFilter, serverFilter]);

  const totalPages = Math.ceil(filteredBindings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayed = filteredBindings.slice(startIndex, startIndex + itemsPerPage);

  const upCount = useMemo(
    () => (bindings ?? []).filter((b) => !b.is_disabled && b.type !== "blocked").length,
    [bindings]
  );

  const downCount = useMemo(
    () => (bindings ?? []).filter((b) => b.is_disabled || b.type === "blocked").length,
    [bindings]
  );

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

  const hasFilter = statusFilter !== "all" || typeFilter !== "all" || !!searchQuery || commentFilter !== "all" || serverFilter !== "all";

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="relative">
          <input
            type="text"
            placeholder="Cari IP, MAC, server, komentar..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
        <div className="hidden sm:flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Putus</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Tipe</option>
            <option value="regular">Regular</option>
            <option value="bypassed">Bypass</option>
            <option value="blocked">Diblokir</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="default">Urutan Default</option>
            <option value="ip_asc">IP Menaik</option>
            <option value="ip_desc">IP Menurun</option>
          </select>


          <select
            value={commentFilter}
            onChange={(e) => { setCommentFilter(e.target.value as any); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Komentar</option>
            <option value="with_comment">Ada Komentar</option>
            <option value="no_comment">Belum Ada Komentar</option>
          </select>

          {/* Filter tambahan khusus saat nonaktif dipilih */}
          {statusFilter === "inactive" && (
            <select
              value={inactiveSortBy}
              onChange={(e) => { setInactiveSortBy(e.target.value as typeof inactiveSortBy); setCurrentPage(1); }}
              className="rounded-lg border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 focus:border-orange-500 focus:outline-none dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
            >
              <option value="last_seen_desc">Putus Paling Lama</option>
              <option value="last_seen_asc">Putus Paling Baru</option>
            </select>
          )}

          {/* Filter Server */}
          <select
            value={serverFilter}
            onChange={(e) => { setServerFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Server</option>
            {hotspotServers.map((server) => (
              <option key={server.name} value={server.name}>
                {server.name}
              </option>
            ))}
          </select>

          {/* Desktop: Reset & Action Buttons */}
          <div className="hidden sm:flex items-center gap-2">
            {hasFilter && (
              <button
                onClick={() => {
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setSearchQuery("");
                  setCommentFilter("all");
                  setServerFilter("all");
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              >
                Reset Filter
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                aria-label="Kelola Hotspot Server"
                onClick={() => router.push("/mikrotik/static/server")}
                className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
              >
                <FiServer className="h-3.5 w-3.5" />
                Kelola Server
              </button>
              <button
                type="button"
                aria-label="Tambah IP Binding"
                onClick={handleOpenCreateBindingModal}
                className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              >
                <FiPlus className="h-3.5 w-3.5" />
                Tambah Binding
              </button>
            </div>
          </div>
        </div>

        {/* Mobile: Filter Button Row */}
        <div className="flex sm:hidden items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              hasFilter 
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400" 
                : "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            <FiFilter className="h-3.5 w-3.5" />
            Filter
            {hasFilter && <span className="ml-1 rounded-full bg-brand-500 px-1.5 text-xs text-white">!</span>}
          </button>
          {hasFilter && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setTypeFilter("all");
                setSearchQuery("");
                setCommentFilter("all");
                setServerFilter("all");
                setCurrentPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              Reset
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleOpenCreateServerModal}
              className="flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-2 py-1.5 text-xs font-medium text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            >
              <FiPlus className="h-3 w-3" />
              Server
            </button>
            <button
              type="button"
              onClick={handleOpenCreateBindingModal}
              className="flex items-center gap-1 rounded-lg bg-brand-500 px-2 py-1.5 text-xs font-medium text-white dark:bg-brand-600"
            >
              <FiPlus className="h-3 w-3" />
              Binding
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsFilterOpen(false)} />
          <div className="relative w-full rounded-t-2xl bg-white p-4 dark:bg-gray-900 animate-in slide-in-from-bottom">
            <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter Binding</h3>
              <button onClick={() => setIsFilterOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pb-20">
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "Semua" },
                    { key: "active", label: "Aktif" },
                    { key: "inactive", label: "Putus" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setStatusFilter(opt.key as typeof statusFilter)}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        statusFilter === opt.key
                          ? "bg-brand-100 text-brand-700 border border-brand-300 dark:bg-brand-900/30 dark:text-brand-400"
                          : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Tipe */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "Semua" },
                    { key: "regular", label: "Regular" },
                    { key: "bypassed", label: "Bypass" },
                    { key: "blocked", label: "Diblokir" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setTypeFilter(opt.key as typeof typeFilter)}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        typeFilter === opt.key
                          ? "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/30 dark:text-purple-400"
                          : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Server */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Server</label>
                <select
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">Semua Server</option>
                  {hotspotServers.map((server) => (
                    <option key={server.name} value={server.name}>{server.name}</option>
                  ))}
                </select>
              </div>
              {/* Sort */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Urutan</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="default">Default</option>
                  <option value="ip_asc">IP Menaik</option>
                  <option value="ip_desc">IP Menurun</option>
                </select>
              </div>
              {/* Comment Filter */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Komentar</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "Semua" },
                    { key: "with_comment", label: "Ada Komentar" },
                    { key: "no_comment", label: "Belum Ada" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setCommentFilter(opt.key as any)}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        commentFilter === opt.key
                          ? "bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {statusFilter === "inactive" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Urutan Putus</label>
                  <select
                    value={inactiveSortBy}
                    onChange={(e) => setInactiveSortBy(e.target.value as typeof inactiveSortBy)}
                    className="w-full rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
                  >
                    <option value="last_seen_desc">Paling Lama</option>
                    <option value="last_seen_asc">Paling Baru</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={`overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 transition-opacity duration-200 ${isRefreshing ? "opacity-60" : "opacity-100"}`}>
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Hotspot IP Binding — {routerName}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400 font-medium">{upCount} Up</span>
                <span className="mx-1">•</span>
                <span className="text-red-600 dark:text-red-400 font-medium">{downCount} Down</span>
                <span className="ml-1">dari {bindings?.length ?? 0} total</span>
                {lastUpdate && (
                  <span className="ml-2 text-xs text-gray-400">
                    • Diperbarui {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 border-l border-gray-200 pl-3 dark:border-gray-800">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-green-500" : "bg-gray-400"}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {isConnected ? "Langsung" : "Terputus"}
              </span>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
                {/* Mobile: Show Comment header, Desktop: hidden (has its own column) */}
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:hidden">Komentar</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Komentar</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">IP</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">MAC</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Server</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Last Seen</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Tipe</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {isLoading && (!bindings || bindings.length === 0) ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredBindings.length > 0 ? (
                displayed.map((binding, index) => (
                  <BindingRow
                    key={binding.id || `binding-${index}`}
                    binding={binding}
                    index={index}
                    startIndex={startIndex}
                    onBlock={handleBlock}
                    onUnblock={handleUnblock}
                    onDelete={handleDelete}
                    onEdit={handleOpenEdit}
                    onSaveToDb={handleSaveToDb}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiWifiOff className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {hasFilter
                          ? "Tidak ada binding yang cocok dengan filter"
                          : "Tidak ada IP binding"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredBindings.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredBindings.length)} dari {filteredBindings.length}
                {hasFilter && bindings && filteredBindings.length < bindings.length && (
                  <span className="ml-1 text-gray-400">(difilter dari {bindings.length})</span>
                )}
              </span>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1.5">
                <span>Per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
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

      {/* Edit Modal */}
      {isEditModalOpen && editingBinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit IP Binding</h3>
              <button type="button" aria-label="Tutup modal edit binding" onClick={handleCloseModal} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Address - full width */}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat IP</label>
                  <input
                    type="text"
                    value={formData.address || ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* MAC Address */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">MAC Address</label>
                  <input
                    type="text"
                    value={formData.mac_address || ""}
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Server - Dropdown */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Server</label>
                  <select
                    value={formData.server || "all"}
                    onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                    disabled={isLoadingServers}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                  >
                    <option value="all">Semua Server ("all")</option>
                    {serverOptions.map((server) => (
                      <option key={server.name} value={server.name}>
                        {server.name} ({server.interface})
                      </option>
                    ))}
                  </select>
                  {isLoadingServers && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Memuat server...</span>
                  )}
                </div>
                {/* To Address */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">To Address</label>
                  <input
                    type="text"
                    value={formData.to_address || ""}
                    onChange={(e) => setFormData({ ...formData, to_address: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Comment */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Komentar</label>
                  <input
                    type="text"
                    value={formData.comment || ""}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Type */}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe</label>
                  <select
                    value={formData.type || "regular"}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as StaticBinding["type"] })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="regular">Regular</option>
                    <option value="bypassed">Bypass</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" aria-label="Batal edit binding" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan perubahan binding" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tambah IP Binding</h3>
              <button type="button" aria-label="Tutup modal tambah binding" onClick={handleCloseModal} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Address - full width */}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Alamat IP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address || ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="192.168.1.100"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* MAC Address */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    MAC Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.mac_address || ""}
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Server - Dropdown */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Server</label>
                  <select
                    value={formData.server || "all"}
                    onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                    disabled={isLoadingServers}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                  >
                    <option value="all">Semua Server ("all")</option>
                    {serverOptions.map((server) => (
                      <option key={server.name} value={server.name}>
                        {server.name} ({server.interface})
                      </option>
                    ))}
                  </select>
                  {isLoadingServers && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Memuat server...</span>
                  )}
                </div>
                {/* To Address */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">To Address</label>
                  <input
                    type="text"
                    value={formData.to_address || ""}
                    onChange={(e) => setFormData({ ...formData, to_address: e.target.value })}
                    placeholder="10.0.0.100"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Comment */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Komentar</label>
                  <input
                    type="text"
                    value={formData.comment || ""}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Label pelanggan"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Type */}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe</label>
                  <select
                    value={formData.type || "regular"}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as StaticBinding["type"] })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="regular">Regular</option>
                    <option value="bypassed">Bypass</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" aria-label="Batal tambah binding" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan IP binding baru" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Server Modal */}
      {isCreateServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Tambah Profile (Server) Hotspot
              </h3>
              <button type="button" aria-label="Tutup modal tambah server Hotspot" onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateServer} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Profile/Server <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={serverFormData.name || ""}
                    onChange={(e) => setServerFormData({ ...serverFormData, name: e.target.value })}
                    placeholder="hotspot1"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Interface <span className="text-red-500">*</span>
                  </label>
                  <InterfaceSelect
                    value={serverFormData.interface || ""}
                    onChange={(v) => setServerFormData({ ...serverFormData, interface: v })}
                    interfaces={routerInterfaces}
                    isLoading={isLoadingInterfaces}
                    error={interfacesError}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Address Pool
                  </label>
                  <input
                    type="text"
                    value={serverFormData.address_pool || ""}
                    onChange={(e) => setServerFormData({ ...serverFormData, address_pool: e.target.value })}
                    placeholder="hs-pool-1"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Profile
                  </label>
                  <input
                    type="text"
                    value={serverFormData.profile || ""}
                    onChange={(e) => setServerFormData({ ...serverFormData, profile: e.target.value })}
                    placeholder="default"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" aria-label="Batal tambah server Hotspot" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan profile server Hotspot baru" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-purple-600 dark:hover:bg-purple-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan Profile</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
