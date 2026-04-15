"use client";

import React, {
  useState,
  memo,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { DHCPLease, DHCPApi, DHCPServer } from "@/lib/api/dhcp";
import { useMikrotikDHCP } from "@/lib/hooks/useMikrotikDHCP";
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
  FiWifiOff,
  FiEdit2,
  FiRefreshCw,
  FiPlus,
  FiLoader,
  FiLock,
  FiUnlock,
  FiFilter,
  FiSlash,
  FiServer,
  FiDatabase,
} from "react-icons/fi";

// ─── MikroTik last_seen parser ───────────────────────────────────────────────
function parseLastSeenToSeconds(lastSeen: string): number {
  if (!lastSeen || lastSeen === "never") return Infinity;
  let total = 0;
  const days = lastSeen.match(/(\d+)d/);
  const hours = lastSeen.match(/(\d+)h/);
  const minutes = lastSeen.match(/(\d+)m(?!s)/);
  const seconds = lastSeen.match(/(\d+)s/);
  if (days) total += parseInt(days[1]) * 86400;
  if (hours) total += parseInt(hours[1]) * 3600;
  if (minutes) total += parseInt(minutes[1]) * 60;
  if (seconds) total += parseInt(seconds[1]);
  return total;
}

function formatLastSeen(lastSeen: string): string {
  if (!lastSeen || lastSeen === "never") return "Tidak pernah";
  const secs = parseLastSeenToSeconds(lastSeen);
  if (secs === Infinity) return "Tidak pernah";
  if (secs < 60) return `${secs} detik lalu`;
  if (secs < 3600) return `${Math.floor(secs / 60)} menit lalu`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} jam lalu`;
  return `${Math.floor(secs / 86400)} hari lalu`;
}

function LastSeenBadge({ lastSeen }: { lastSeen: string }) {
  if (!lastSeen || lastSeen === "never") {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  }
  const secs = parseLastSeenToSeconds(lastSeen);
  const isVeryLong = secs >= 86400 * 7;
  return (
    <span className={`text-xs font-mono ${
      isVeryLong
        ? "text-red-500 dark:text-red-400"
        : secs >= 86400
          ? "text-orange-500 dark:text-orange-400"
          : "text-gray-500 dark:text-gray-400"
    }`}>
      {formatLastSeen(lastSeen)}
    </span>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ lease }: { lease: DHCPLease }) {
  if (lease.block_type === "blokir") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-200 px-2.5 py-1 text-xs font-semibold text-red-900 dark:bg-red-950/60 dark:text-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-700" />
        BLOKIR
      </span>
    );
  }
  if (lease.is_isolir) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        ISOLIR
      </span>
    );
  }
  if (lease.active_state) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        UP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      DOWN
    </span>
  );
}

// ─── Lease Row ────────────────────────────────────────────────────────────────
interface LeaseRowProps {
  lease: DHCPLease;
  index: number;
  startIndex: number;
  isNew?: boolean;
  onIsolir: (leaseId: number) => void;
  onUnIsolir: (leaseId: number) => void;
  onBlock: (leaseId: number) => void;
  onDelete: (leaseId: number) => void;
  onEdit: (lease: DHCPLease) => void;
  onSaveToDb: (lease: DHCPLease) => void;
}

const LeaseRow = memo(function LeaseRow({
  lease,
  index,
  startIndex,
  isNew = false,
  onIsolir,
  onUnIsolir,
  onBlock,
  onDelete,
  onEdit,
  onSaveToDb,
}: LeaseRowProps) {
  // Track whether this row was just inserted
  const mountedRef = useRef(false);
  const [flash, setFlash] = useState<"green" | "amber" | null>(null);
  const prevLeaseRef = useRef<DHCPLease>(lease);

  // Animate in on first mount (new row added)
  const [entered, setEntered] = useState(!isNew);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (isNew) {
        // Allow a single frame before marking entered so animation plays
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [isNew]);

  // Flash on data update — use setTimeout so setState is never called
  // synchronously inside the effect body (avoids react-hooks/set-state-in-effect).
  useEffect(() => {
    const prev = prevLeaseRef.current;
    const changed =
      prev.is_isolir !== lease.is_isolir ||
      prev.active_state !== lease.active_state ||
      prev.comment !== lease.comment ||
      prev.address !== lease.address;
    prevLeaseRef.current = lease;
    if (!changed) return;
    const color: "green" | "amber" = lease.is_isolir ? "amber" : "green";
    const trigger = setTimeout(() => {
      setFlash(color);
      setTimeout(() => setFlash(null), 900);
    }, 0);
    return () => clearTimeout(trigger);
  }, [lease]);

  const flashClass =
    flash === "green"
      ? "animate-row-flash-green"
      : flash === "amber"
        ? "animate-row-flash-amber"
        : "";

  const enterClass = isNew && !entered ? "opacity-0" : isNew ? "animate-row-enter" : "";

  return (
    <tr className={`transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] ${enterClass} ${flashClass}`}>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>
      {/* Desktop: Comment */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden sm:table-cell">
        {lease.comment ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            {lease.comment}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      {/* Mobile: Show Comment, Desktop: Show IP/Hostname */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 max-w-[150px] md:max-w-none truncate" title={lease.address}>
        {/* Mobile View */}
        <div className="flex flex-col gap-0.5 sm:hidden">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {lease.comment || lease.host_name || lease.address || "-"}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {lease.address || "-"}
          </span>
        </div>
        {/* Desktop View */}
        <div className="hidden sm:flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {lease.address || "-"}
          </span>
          {lease.host_name && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {lease.host_name}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300 hidden md:table-cell">
        {lease.mac_address || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
        {lease.server || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <StatusBadge lease={lease} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden lg:table-cell">
        <LastSeenBadge lastSeen={lease.last_seen} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        {!lease.id ? (
          <button
            type="button"
            aria-label={`Simpan lease ${lease.address} ke database`}
            onClick={() => onSaveToDb(lease)}
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
              aria-label={`Edit lease ${lease.address}`}
              onClick={() => onEdit(lease)}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
              title="Edit Lease"
            >
              <FiEdit2 className="h-3 w-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            {lease.is_isolir ? (
              <button
                type="button"
                aria-label={`Buka ${lease.block_type === "blokir" ? "blokir" : "isolir"} lease ${lease.address}`}
                onClick={() => onUnIsolir(lease.id)}
                className="inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                title={lease.block_type === "blokir" ? "Buka Blokir" : "Buka Isolir"}
              >
                <FiUnlock className="h-3 w-3" />
                <span className="hidden sm:inline">{lease.block_type === "blokir" ? "Buka Blokir" : "Buka Isolir"}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={`Isolir lease ${lease.address}`}
                  onClick={() => onIsolir(lease.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                  title="Isolir"
                >
                  <FiLock className="h-3 w-3" />
                  <span className="hidden sm:inline">Isolir</span>
                </button>
                <button
                  type="button"
                  aria-label={`Blokir lease ${lease.address}`}
                  onClick={() => onBlock(lease.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                  title="Blokir"
                >
                  <FiSlash className="h-3 w-3" />
                  <span className="hidden sm:inline">Blokir</span>
                </button>
              </>
            )}
            <button
              type="button"
              aria-label={`Hapus lease ${lease.address}`}
              onClick={() => onDelete(lease.id)}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
              title="Hapus"
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

// ─── Helper validasi ───────────────────────────────────────────────────────
function validateIP(ip: string): boolean {
  const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip);
}

function validateMAC(mac: string): boolean {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface DHCPTableComponentProps {
  routerId: number;
  routerName: string;
}

export function DHCPTableComponent({ routerId, routerName }: DHCPTableComponentProps) {
  const router = useRouter();
  const {
    data: leases,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refetch,
    patchLease,
    addLease,
    removeLease,
  } = useMikrotikDHCP({ routerId, enabled: true });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Track newly inserted lease ids so LeaseRow can play enter animation once
  const newLeaseIdsRef = useRef<Set<number | string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "isolir">("active");
  const [commentFilter, setCommentFilter] = useState<"all" | "with_comment" | "no_comment">("all");
  const [sortBy, setSortBy] = useState<"default" | "ip_asc" | "ip_desc">("default");
  const [inactiveSortBy, setInactiveSortBy] = useState<"last_seen_desc" | "last_seen_asc">("last_seen_desc");

  const [serverFilter, setServerFilter] = useState<string>("all");
  const [ipRangeFilter, setIpRangeFilter] = useState<string>("");
  const [macPrefixFilter, setMacPrefixFilter] = useState<string>("");
  const [lastSeenFilter, setLastSeenFilter] = useState<"all" | "24h" | "7d" | "30d" | "older">("all");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateServerModalOpen, setIsCreateServerModalOpen] = useState(false);
  const [isCreatePoolModalOpen, setIsCreatePoolModalOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<DHCPLease | null>(null);
  const [formData, setFormData] = useState<Partial<DHCPLease>>({});
  const [serverFormData, setServerFormData] = useState<Partial<DHCPServer>>({
    name: "", interface: "bridge1", address_pool: "", lease_time: "10m"
  });
  const [poolFormData, setPoolFormData] = useState({ name: "", ranges: "", next_pool: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Inline field-level validation errors (no blocking SweetAlert popup)
  const [fieldErrors, setFieldErrors] = useState<{ address?: string; mac_address?: string }>({});

  // Fetch DHCP servers
  const { data: dhcpServers = [], isLoading: isLoadingServers, refetch: refetchServers } = useDHCPServers({
    routerId,
    enabled: true,
  });

  // Fetch router interfaces for the Create Server modal dropdown
  const {
    data: routerInterfaces,
    isLoading: isLoadingInterfaces,
    error: interfacesError,
  } = useRouterInterfaces({ routerId, enabled: isCreateServerModalOpen });

  // Fetch available address pools from MikroTik when the Create Server modal is open
  const [availablePools, setAvailablePools] = useState<string[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  useEffect(() => {
    if (!isCreateServerModalOpen) return;
    setIsLoadingPools(true);
    DHCPApi.getPools(routerId)
      .then(setAvailablePools)
      .catch(() => setAvailablePools([]))
      .finally(() => setIsLoadingPools(false));
  }, [isCreateServerModalOpen, routerId]);

  // ── Reset saat router ganti ──
  useEffect(() => {
    setCurrentPage(1);
    setStatusFilter("all");
    setSearchQuery("");
    setCommentFilter("all");
  }, [routerId]);

  // ── Keyboard & scroll lock saat modal buka ──
  useEffect(() => {
    if (!isEditModalOpen && !isCreateModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseModal();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [isEditModalOpen, isCreateModalOpen]);

  // ── Helpers ──────────────────────────────────────────────────────────────
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
    setIsCreatePoolModalOpen(false);
    setEditingLease(null);
    setFormData({});
    setServerFormData({ name: "", interface: "bridge1", address_pool: "", lease_time: "10m" });
    setPoolFormData({ name: "", ranges: "", next_pool: "" });
    setIsSaving(false);
    setFieldErrors({});
  }, []);

  const isIpInRange = useCallback((ip: string, cidr: string): boolean => {
    try {
      const [rangeIp, prefixStr] = cidr.split('/');
      const prefix = parseInt(prefixStr);
      if (!rangeIp || isNaN(prefix)) return true;
      const ipNum = ip.split('.').reduce((acc, v) => acc * 256 + Number(v), 0);
      const rangeNum = rangeIp.split('.').reduce((acc, v) => acc * 256 + Number(v), 0);
      const mask = -1 << (32 - prefix);
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return true;
    }
  }, []);

  const handleOpenCreateLeaseModal = useCallback(() => {
    setFormData({});
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenCreateServerModal = useCallback(() => {
    setServerFormData({ name: "", interface: "bridge1", address_pool: "", lease_time: "10m" });
    setIsCreateServerModalOpen(true);
  }, []);

  const handleOpenCreatePoolModal = useCallback(() => {
    setPoolFormData({ name: "", ranges: "", next_pool: "" });
    setIsCreatePoolModalOpen(true);
  }, []);

  const handleSaveToDb = useCallback((lease: DHCPLease) => {
    setFormData({
      address: lease.address,
      mac_address: lease.mac_address,
      host_name: lease.host_name,
      client_id: lease.client_id,
      server: lease.server,
      comment: lease.comment,
    });
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((lease: DHCPLease) => {
    setEditingLease(lease);
    setFormData({
      ...lease,
      dynamic: lease.dynamic ?? false,
    });
    setIsEditModalOpen(true);
  }, []);

  // ── Action Handlers ───────────────────────────────────────────────────────
  const handleIsolir = useCallback(async (leaseId: number) => {
    const result = await SweetAlert.confirm(
      "Isolir DHCP Lease",
      "Apakah Anda yakin ingin mengisolir lease ini?"
    );
    if (!result.isConfirmed) return;

    // Optimistic update
    const originalLease = leases?.find(l => l.id === leaseId);
    if (!originalLease) return;
    patchLease(leaseId, { is_isolir: true, block_type: "isolir" });

    try {
      await DHCPApi.isolir(routerId, leaseId);
      // patchLease already updated the row — no full refetch needed, just
      // let WebSocket push the canonical state in the background.
    } catch (error: any) {
      patchLease(leaseId, { is_isolir: originalLease.is_isolir, block_type: originalLease.block_type });
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal mengisolir DHCP lease";
      SweetAlert.error("Error", msg);
    }
  }, [routerId, patchLease, leases]);

  const handleUnIsolir = useCallback(async (leaseId: number) => {
    const result = await SweetAlert.confirm(
      "Buka Isolir DHCP Lease",
      "Apakah Anda yakin ingin membuka isolir lease ini?"
    );
    if (!result.isConfirmed) return;

    const originalLease = leases?.find(l => l.id === leaseId);
    if (!originalLease) return;
    patchLease(leaseId, { is_isolir: false, block_type: "none" });

    try {
      await DHCPApi.unIsolir(routerId, leaseId);
    } catch (error: any) {
      patchLease(leaseId, { is_isolir: originalLease.is_isolir, block_type: originalLease.block_type });
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal membuka isolir DHCP lease";
      SweetAlert.error("Error", msg);
    }
  }, [routerId, patchLease, leases]);

  const handleBlock = useCallback(async (leaseId: number) => {
    const originalLease = leases?.find(l => l.id === leaseId);
    if (!originalLease) return;

    const result = await SweetAlert.confirm(
      "Blokir DHCP Lease",
      `Apakah Anda yakin ingin memblokir client ini?\n\nIP: ${originalLease.address}\nMAC: ${originalLease.mac_address}\n\nClient akan diblokir dengan block-access=yes dan ditambahkan ke firewall isolir list.`
    );
    if (!result.isConfirmed) return;

    // Optimistic update
    patchLease(leaseId, { is_isolir: true, block_type: "blokir" });

    try {
      await DHCPApi.block(routerId, leaseId);
    } catch (error: any) {
      patchLease(leaseId, { is_isolir: originalLease.is_isolir, block_type: originalLease.block_type });
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal memblokir DHCP lease";
      SweetAlert.error("Error", msg);
    }
  }, [routerId, patchLease, leases]);

  const handleDelete = useCallback(async (leaseId: number) => {
    const result = await SweetAlert.confirm(
      "Hapus DHCP Lease",
      "Apakah Anda yakin ingin menghapus lease ini? Tindakan ini tidak dapat dibatalkan."
    );
    if (!result.isConfirmed) return;

    // Optimistic remove — row disappears immediately
    const snapshot = leases?.find(l => l.id === leaseId);
    removeLease(leaseId);

    try {
      await DHCPApi.delete(routerId, leaseId);
    } catch (error: any) {
      // Rollback: re-insert the snapshot if the API call fails
      if (snapshot) addLease(snapshot);
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menghapus DHCP lease";
      SweetAlert.error("Error", msg);
    }
  }, [routerId, leases, removeLease, addLease]);

  // ── Inline field validation (no blocking popup) ──────────────────────────
  const validateForm = useCallback((): boolean => {
    const errors: { address?: string; mac_address?: string } = {};
    if (!formData.address) {
      errors.address = "Alamat IP harus diisi";
    } else if (!validateIP(formData.address)) {
      errors.address = "Format tidak valid (contoh: 192.168.1.100)";
    }
    if (!formData.mac_address) {
      errors.mac_address = "MAC Address harus diisi";
    } else if (!validateMAC(formData.mac_address)) {
      errors.mac_address = "Format tidak valid (contoh: AA:BB:CC:DD:EE:FF)";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Clear a single field error as the user types
  const clearFieldError = useCallback((field: keyof typeof fieldErrors) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ── Update Lease (Edit) ──────────────────────────────────────────────────
  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLease || isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    const originalLease = { ...editingLease };
    const updatedData = { ...formData };
    patchLease(editingLease.id, updatedData);

    try {
      // Update basic lease data
      await DHCPApi.update(routerId, editingLease.id, updatedData);
      
      // Handle dynamic/static change if needed
      if (originalLease.dynamic !== updatedData.dynamic) {
        if (updatedData.dynamic) {
          await DHCPApi.makeDynamic(routerId, editingLease.id);
        } else {
          await DHCPApi.makeStatic(routerId, editingLease.id);
        }
      }
      
      SweetAlert.success("Berhasil", "DHCP lease berhasil diperbarui");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      patchLease(editingLease.id, originalLease);
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal memperbarui DHCP lease";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [editingLease, formData, routerId, handleCloseModal, isSaving, smoothRefetch, patchLease, validateForm]);

  // ── Create Lease ─────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const created = await DHCPApi.create(routerId, formData);
      // Mark as new so LeaseRow plays enter animation
      newLeaseIdsRef.current.add(created.id ?? created.mac_address);
      addLease(created);
      SweetAlert.success("Berhasil", "DHCP lease berhasil ditambahkan");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menambahkan DHCP lease";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, routerId, handleCloseModal, isSaving, smoothRefetch, validateForm, addLease]);

  // ── Create Server ────────────────────────────────────────────────────────
  const handleCreateServer = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!serverFormData.name || !serverFormData.interface) {
      SweetAlert.error("Error", "Nama dan Interface server harus diisi");
      return;
    }

    setIsSaving(true);
    try {
      await DHCPApi.createServer(routerId, serverFormData);
      SweetAlert.success("Berhasil", "DHCP Server berhasil ditambahkan");
      handleCloseModal();
      refetchServers();
      setServerFilter("all");
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menambahkan DHCP server";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [serverFormData, routerId, isSaving, handleCloseModal, refetchServers]);

  const handleCreatePool = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!poolFormData.name || !poolFormData.ranges) {
      SweetAlert.error("Error", "Nama dan Range IP wajib diisi");
      return;
    }
    setIsSaving(true);
    try {
      await DHCPApi.createPool(routerId, poolFormData);
      SweetAlert.success("Berhasil", "IP Pool berhasil dibuat");
      // Refresh the pool list so the new pool shows in the dropdown
      setAvailablePools([]);
      DHCPApi.getPools(routerId).then(setAvailablePools).catch(() => {});
      handleCloseModal();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal membuat IP Pool";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [poolFormData, routerId, isSaving, handleCloseModal]);

  // ── Filter & Sort ─────────────────────────────────────────────────────────
  const filteredLeases = useMemo(() => {
    let list = leases ?? [];

    if (statusFilter === "active") {
      list = list.filter((l) => l.active_state && !l.is_isolir);
    } else if (statusFilter === "inactive") {
      list = list.filter((l) => !l.active_state && !l.is_isolir);
    } else if (statusFilter === "isolir") {
      list = list.filter((l) => l.is_isolir);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (l) =>
          (l.address && l.address.toLowerCase().includes(q)) ||
          (l.mac_address && l.mac_address.toLowerCase().includes(q)) ||
          (l.host_name && l.host_name.toLowerCase().includes(q)) ||
          (l.server && l.server.toLowerCase().includes(q)) ||
          (l.comment && l.comment.toLowerCase().includes(q))
      );
    }

    if (serverFilter !== "all") {
      list = list.filter((l) => l.server === serverFilter);
    }

    if (ipRangeFilter.trim()) {
      list = list.filter((l) => l.address && isIpInRange(l.address, ipRangeFilter.trim()));
    }

    if (macPrefixFilter.trim()) {
      const prefix = macPrefixFilter.trim().toLowerCase();
      list = list.filter((l) => l.mac_address && l.mac_address.toLowerCase().startsWith(prefix));
    }

    if (lastSeenFilter !== "all") {
      list = list.filter((l) => {
        const secs = parseLastSeenToSeconds(l.last_seen);
        if (secs === Infinity) return lastSeenFilter === "older";
        const hours = secs / 3600;
        switch (lastSeenFilter) {
          case "24h": return hours <= 24;
          case "7d": return hours <= 24 * 7;
          case "30d": return hours <= 24 * 30;
          case "older": return hours > 24 * 30;
          default: return true;
        }
      });
    }

    if (commentFilter === "with_comment") {
      list = list.filter((l) => l.comment && l.comment.trim() !== "");
    } else if (commentFilter === "no_comment") {
      list = list.filter((l) => !l.comment || l.comment.trim() === "");
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

    if (statusFilter === "inactive") {
      list = [...list].sort((a, b) => {
        const aS = parseLastSeenToSeconds(a.last_seen);
        const bS = parseLastSeenToSeconds(b.last_seen);
        return inactiveSortBy === "last_seen_desc" ? bS - aS : aS - bS;
      });
    }

    return list;
  }, [leases, statusFilter, searchQuery, sortBy, inactiveSortBy, serverFilter, ipRangeFilter, macPrefixFilter, lastSeenFilter, isIpInRange, commentFilter]);

  const totalPages = Math.ceil(filteredLeases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedLeases = filteredLeases.slice(startIndex, startIndex + itemsPerPage);

  const activeCount = useMemo(
    () => (leases ?? []).filter((l) => l.active_state && !l.is_isolir).length,
    [leases]
  );
  const isolirCount = useMemo(
    () => (leases ?? []).filter((l) => l.is_isolir).length,
    [leases]
  );
  const offlineCount = useMemo(
    () => (leases ?? []).filter((l) => !l.active_state && !l.is_isolir).length,
    [leases]
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

  // ── Server dropdown options with fallback ─────────────────────────────────
  const serverOptions = useMemo(() => {
    const servers = [...dhcpServers];
    if (editingLease?.server && !servers.some(s => s.name === editingLease.server)) {
      servers.push({ name: editingLease.server, interface: "tidak dikenal" } as any);
    }
    return servers;
  }, [dhcpServers, editingLease]);

  const hasFilter = statusFilter !== "all" || !!searchQuery || serverFilter !== "all" || !!ipRangeFilter || !!macPrefixFilter || lastSeenFilter !== "all" || commentFilter !== "all";

  // ── Render ────────────────────────────────────────────────────────────────
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
            placeholder="Cari IP, MAC, hostname, server..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
        <div className="hidden sm:flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Range IP (contoh: 192.168.1.0/24)"
            value={ipRangeFilter}
            onChange={(e) => { setIpRangeFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <input
            type="text"
            placeholder="Prefix MAC (contoh: AA:BB:CC)"
            value={macPrefixFilter}
            onChange={(e) => { setMacPrefixFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
            <option value="isolir">Terisolir</option>
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

          {statusFilter === "inactive" && (
            <select
              value={inactiveSortBy}
              onChange={(e) => { setInactiveSortBy(e.target.value as typeof inactiveSortBy); setCurrentPage(1); }}
              className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 focus:border-orange-500 focus:outline-none dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
            >
              <option value="last_seen_desc">Nonaktif Paling Lama</option>
              <option value="last_seen_asc">Nonaktif Paling Baru</option>
            </select>
          )}

          <select
            value={serverFilter}
            onChange={(e) => { setServerFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Server</option>
            {dhcpServers.map((server) => (
              <option key={server.name} value={server.name}>
                {server.name}
              </option>
            ))}
          </select>

          <select
            value={lastSeenFilter}
            onChange={(e) => { setLastSeenFilter(e.target.value as typeof lastSeenFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Waktu</option>
            <option value="24h">≤ 24 Jam</option>
            <option value="7d">≤ 7 Hari</option>
            <option value="30d">≤ 30 Hari</option>
            <option value="older">&gt; 30 Hari</option>
          </select>

          {/* Desktop: Reset & Action Buttons */}
          <div className="hidden sm:flex items-center gap-2">
            {hasFilter && (
              <button
                onClick={() => {
                  setStatusFilter("all");
                  setSearchQuery("");
                  setServerFilter("all");
                  setIpRangeFilter("");
                  setMacPrefixFilter("");
                  setLastSeenFilter("all");
                  setCommentFilter("all");
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
                aria-label="Kelola DHCP Paket"
                onClick={() => router.push("/mikrotik/dhcp/paket")}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                <FiServer className="h-3.5 w-3.5" />
                Kelola Paket
              </button>
              <button
                type="button"
                aria-label="Kelola IP Pool"
                onClick={() => router.push("/mikrotik/dhcp/pool")}
                className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
              >
                <FiDatabase className="h-3.5 w-3.5" />
                Kelola Pool
              </button>
              <button
                type="button"
                aria-label="Tambah DHCP Lease"
                onClick={handleOpenCreateLeaseModal}
                className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              >
                <FiPlus className="h-3.5 w-3.5" />
                Tambah Lease
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
                setSearchQuery("");
                setServerFilter("all");
                setIpRangeFilter("");
                setMacPrefixFilter("");
                setLastSeenFilter("all");
                setCommentFilter("all");
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
              onClick={() => router.push("/mikrotik/dhcp/paket")}
              className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              <FiServer className="h-3 w-3" />
              Paket
            </button>
            <button
              type="button"
              onClick={() => router.push("/mikrotik/dhcp/pool")}
              className="flex items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
            >
              <FiDatabase className="h-3 w-3" />
              Pool
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter DHCP</h3>
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
                    { key: "isolir", label: "Terisolir" },
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
              {/* Server */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Server</label>
                <select
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">Semua Server</option>
                  {dhcpServers.map((server) => (
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
              {/* Last Seen */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Waktu Terakhir</label>
                <select
                  value={lastSeenFilter}
                  onChange={(e) => setLastSeenFilter(e.target.value as typeof lastSeenFilter)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">Semua Waktu</option>
                  <option value="24h">≤ 24 Jam</option>
                  <option value="7d">≤ 7 Hari</option>
                  <option value="30d">≤ 30 Hari</option>
                  <option value="older">&gt; 30 Hari</option>
                </select>
              </div>
              {/* Range Filters */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Range IP</label>
                  <input
                    type="text"
                    placeholder="192.168.1.0/24"
                    value={ipRangeFilter}
                    onChange={(e) => setIpRangeFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Prefix MAC</label>
                  <input
                    type="text"
                    placeholder="AA:BB:CC"
                    value={macPrefixFilter}
                    onChange={(e) => setMacPrefixFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
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
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  DHCP Lease — {routerName}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">{activeCount} Aktif</span>
                {offlineCount > 0 && (
                  <span className="ml-2 text-gray-500">• {offlineCount} Putus</span>
                )}
                {isolirCount > 0 && (
                  <span className="ml-2 text-red-600 dark:text-red-400">• {isolirCount} Terisolir</span>
                )}
                <span className="ml-2 text-gray-400">Total: {leases?.length ?? 0}</span>
                {lastUpdate && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Komentar</th>
                {/* Mobile: Show Komentar/IP, Desktop: IP / Hostname */}
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:hidden">Komentar / IP</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">IP / Hostname</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">MAC Address</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Server</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Last Seen</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {isLoading && (!leases || leases.length === 0) ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredLeases.length > 0 ? (
                displayedLeases.map((lease, index) => {
                  const rowKey = lease.id ? String(lease.id) : `new-${lease.mac_address || index}`;
                  const isNewRow = newLeaseIdsRef.current.has(lease.id ?? lease.mac_address);
                  // Clear the new-flag after first render so re-mounts don't re-animate
                  if (isNewRow) newLeaseIdsRef.current.delete(lease.id ?? lease.mac_address);
                  return (
                    <LeaseRow
                      key={rowKey}
                      lease={lease}
                      index={index}
                      startIndex={startIndex}
                      isNew={isNewRow}
                      onIsolir={handleIsolir}
                      onUnIsolir={handleUnIsolir}
                      onBlock={handleBlock}
                      onDelete={handleDelete}
                      onEdit={handleOpenEditModal}
                      onSaveToDb={handleSaveToDb}
                    />
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiWifiOff className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {hasFilter
                          ? "Tidak ada lease yang cocok dengan filter"
                          : "Tidak ada DHCP lease"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredLeases.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredLeases.length)} dari {filteredLeases.length}
                {hasFilter && leases && filteredLeases.length < leases.length && (
                  <span className="ml-1 text-gray-400">(difilter dari {leases.length})</span>
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

      {/* Edit Modal */}
      {isEditModalOpen && editingLease && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit DHCP Lease
              </h3>
              <button type="button" aria-label="Tutup modal edit lease" onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Alamat IP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address || ""}
                    onChange={(e) => { setFormData({ ...formData, address: e.target.value }); clearFieldError("address"); }}
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${
                      fieldErrors.address
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    }`}
                  />
                  {fieldErrors.address && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.address}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    MAC Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.mac_address || ""}
                    onChange={(e) => { setFormData({ ...formData, mac_address: e.target.value }); clearFieldError("mac_address"); }}
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${
                      fieldErrors.mac_address
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    }`}
                  />
                  {fieldErrors.mac_address && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.mac_address}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Server
                  </label>
                  {isLoadingServers ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Memuat server...</div>
                  ) : (
                    <select
                      value={formData.server || ""}
                      onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">-- Pilih Server --</option>
                      {serverOptions.map((server) => (
                        <option key={server.name} value={server.name}>
                          {server.name} ({server.interface})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Host
                  </label>
                  <input
                    type="text"
                    value={formData.host_name || ""}
                    onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={formData.client_id || ""}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Komentar
                  </label>
                  <input
                    type="text"
                    value={formData.comment || ""}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Make Static Checkbox - Editable for Edit */}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!formData.dynamic}
                      onChange={(e) => setFormData({ ...formData, dynamic: !e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Make Static
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Static lease mengikat IP ke MAC address secara permanen (tidak berflag &quot;D&quot; di Winbox)
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button type="button" aria-label="Reset form edit lease" onClick={() => setFormData(editingLease)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Reset
                </button>
                <button type="button" aria-label="Batal edit lease" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan perubahan lease" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
                  {isSaving ? (
                    <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</>
                  ) : (
                    <><FiSave className="h-4 w-4" />Simpan</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Tambah DHCP Lease
              </h3>
              <button type="button" aria-label="Tutup modal tambah lease" onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Alamat IP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address || ""}
                    onChange={(e) => { setFormData({ ...formData, address: e.target.value }); clearFieldError("address"); }}
                    placeholder="192.168.1.100"
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${
                      fieldErrors.address
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    }`}
                  />
                  {fieldErrors.address && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.address}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    MAC Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.mac_address || ""}
                    onChange={(e) => { setFormData({ ...formData, mac_address: e.target.value }); clearFieldError("mac_address"); }}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${
                      fieldErrors.mac_address
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-600"
                        : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    }`}
                  />
                  {fieldErrors.mac_address && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.mac_address}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Server
                  </label>
                  {isLoadingServers ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Memuat server...</div>
                  ) : (
                    <select
                      value={formData.server || ""}
                      onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">-- Pilih Server --</option>
                      {dhcpServers.map((server) => (
                        <option key={server.name} value={server.name}>
                          {server.name} ({server.interface})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Host
                  </label>
                  <input
                    type="text"
                    value={formData.host_name || ""}
                    onChange={(e) => setFormData({ ...formData, host_name: e.target.value })}
                    placeholder="klien-01"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={formData.client_id || ""}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    placeholder="klien-01"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Komentar
                  </label>
                  <input
                    type="text"
                    value={formData.comment || ""}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Label pelanggan"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                {/* Make Static Checkbox - Read Only for Create */}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-not-allowed">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Make Static
                    </span>
                    <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Default
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Lease baru selalu bersifat static di MikroTik RouterOS (tidak bisa diubah)
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button type="button" aria-label="Reset form tambah lease" onClick={() => setFormData({})}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Reset
                </button>
                <button type="button" aria-label="Batal tambah lease" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan DHCP lease baru" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
                  {isSaving ? (
                    <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</>
                  ) : (
                    <><FiSave className="h-4 w-4" />Simpan</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Server Modal */}
      {isCreateServerModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Tambah Profile (Server) DHCP
              </h3>
              <button type="button" aria-label="Tutup modal tambah server DHCP" onClick={handleCloseModal}
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
                  {isLoadingPools ? (
                    <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
                  ) : (
                    <select
                      value={serverFormData.address_pool || ""}
                      onChange={(e) => setServerFormData({ ...serverFormData, address_pool: e.target.value })}
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
                    value={serverFormData.lease_time || ""}
                    onChange={(e) => setServerFormData({ ...serverFormData, lease_time: e.target.value })}
                    placeholder="10m"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" aria-label="Batal tambah server DHCP" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan profile server DHCP baru" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan Profile</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Create IP Pool Modal ─────────────────────────────────────────────── */}
      {isCreatePoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tambah IP Pool</h2>
              <button type="button" aria-label="Tutup modal" onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePool} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nama Pool <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={poolFormData.name}
                  onChange={(e) => setPoolFormData({ ...poolFormData, name: e.target.value })}
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
                  value={poolFormData.ranges}
                  onChange={(e) => setPoolFormData({ ...poolFormData, ranges: e.target.value })}
                  placeholder="192.168.1.100-192.168.1.200"
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-400">Format: 192.168.1.100-192.168.1.200 atau 10.0.0.0/24</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Next Pool <span className="text-xs font-normal text-gray-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={poolFormData.next_pool}
                  onChange={(e) => setPoolFormData({ ...poolFormData, next_pool: e.target.value })}
                  placeholder="pool_tambahan"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" aria-label="Batal tambah pool" onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  Batal
                </button>
                <button type="submit" aria-label="Simpan IP Pool baru" disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan Pool</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}