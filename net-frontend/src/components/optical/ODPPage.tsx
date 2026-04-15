"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiRefreshCw,
  FiMapPin,
  FiImage,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiWifiOff,
  FiServer,
  FiUser,
  FiGrid,
  FiEye,
  FiMap,
} from "react-icons/fi";
import { OpticalApi } from "@/lib/api/genieacs";
import { useOpticalSelectionStore } from "@/store/opticalSelectionStore";
import { api } from "@/lib/axios";
import { SweetAlert } from "@/lib/sweetalert";
import type { ODPSummary } from "@/types/optical.types";
import type { MikrotikRouter } from "@/lib/api/mikrotik";
import type { User } from "@/lib/api/users";

// ─── Port capacity bar ────────────────────────────────────────────────────────

function PortBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
  const textColor =
    pct >= 90 ? "text-red-600 dark:text-red-400" : pct >= 70 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">Kapasitas Port</span>
        <span className={`font-semibold ${textColor}`}>{used}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {total - used} port tersedia
      </p>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function ODPStatusBadge({ active, fault }: { active: boolean; fault: boolean }) {
  if (!active)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        Nonaktif
      </span>
    );
  if (fault)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Gangguan
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
      Normal
    </span>
  );
}

// ─── ODP Card ─────────────────────────────────────────────────────────────────

interface ODPCardProps {
  odp: ODPSummary;
  routerName?: string;
  techName?: string;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  onViewMap: (odp: ODPSummary) => void;
}

function ODPCard({ odp, routerName, techName, onDelete, isDeleting, onViewMap }: ODPCardProps) {
  const router = useRouter();
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      {/* Photo */}
      <div className="relative h-48 w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        {odp.photo_url ? (
          <a href={odp.photo_url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={odp.photo_url}
              alt={odp.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="p-3 text-xs font-medium text-white">Lihat foto penuh →</span>
            </div>
          </a>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-300 dark:text-gray-600">
            <FiImage className="h-12 w-12" />
            <span className="text-sm">Belum ada foto</span>
          </div>
        )}
        {/* Status badge overlay */}
        <div className="absolute left-3 top-3">
          <ODPStatusBadge active={odp.is_active} fault={odp.fault_suspected} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Name + location */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{odp.name}</h3>
            {odp.ip_address && (
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{odp.ip_address}</p>
            )}
          </div>
          {odp.latitude && odp.longitude && (
            <a
              href={`https://maps.google.com/?q=${odp.latitude},${odp.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <FiMapPin className="h-3 w-3" />
              Maps
            </a>
          )}
        </div>

        {/* Port bar */}
        {odp.total_ports ? (
          <PortBar used={odp.used_ports ?? 0} total={odp.total_ports} />
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">Port tidak dikonfigurasi</p>
        )}

        {/* Meta info */}
        <div className="space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          {/* ONU count */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <FiGrid className="h-3.5 w-3.5" />
              <span>ONU</span>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {odp.total_onus}
              {odp.down_onus > 0 && (
                <span className="ml-1 text-red-500">({odp.down_onus} down)</span>
              )}
            </span>
          </div>
          {/* Router */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <FiServer className="h-3.5 w-3.5" />
              <span>Router</span>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
              {routerName ?? "—"}
            </span>
          </div>
          {/* Technician */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <FiUser className="h-3.5 w-3.5" />
              <span>Teknisi</span>
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
              {techName ?? "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => router.push(`/optical/odp/${odp.id}`)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <FiEye className="h-3.5 w-3.5" />
            Detail
          </button>
          <button
            onClick={() => router.push(`/optical/odp/${odp.id}/edit`)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            <FiEdit2 className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={() => onViewMap(odp)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
            title="Lihat di Peta"
          >
            <FiMap className="h-3.5 w-3.5" />
            Peta
          </button>
          <button
            onClick={() => onDelete(odp.id)}
            disabled={isDeleting}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="h-48 w-full bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex gap-2 pt-1">
          <div className="h-8 flex-1 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 flex-1 rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ODPPage() {
  const pageRouter = useRouter();
  const { setSelectedODP } = useOpticalSelectionStore();
  const [odps, setOdps] = useState<ODPSummary[]>([]);
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "normal" | "fault" | "inactive">("all");
  const [portFilter, setPortFilter] = useState<"all" | "available" | "full">("all");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [odpData, routerRes, userRes] = await Promise.all([
        OpticalApi.listODP(),
        api.get<{ data: MikrotikRouter[] }>("/v1/mikrotik"),
        api.get<{ data: User[] }>("/v1/users/"),
      ]);
      setOdps(odpData);
      setRouters(routerRes.data.data ?? []);
      const allUsers: User[] = userRes.data.data ?? [];
      setTechnicians(allUsers.filter((u) => u.role === "teknisi" || u.role === "admin"));
    } catch {
      setError("Gagal memuat data ODP");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const smoothRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await load(); } finally { setTimeout(() => setIsRefreshing(false), 500); }
  }, [load]);

  const handleDelete = useCallback(async (id: number) => {
    const result = await SweetAlert.confirm(
      "Hapus ODP",
      "Apakah Anda yakin ingin menghapus ODP ini? Tindakan ini tidak dapat dibatalkan."
    );
    if (!result.isConfirmed) return;

    setDeletingId(id);
    try {
      await OpticalApi.deleteODP(id);
      setOdps((prev) => prev.filter((o) => o.id !== id));
      SweetAlert.success("Berhasil", "ODP berhasil dihapus");
    } catch (err: any) {
      SweetAlert.error("Error", err?.response?.data?.message ?? "Gagal menghapus ODP");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleViewMap = useCallback((odp: ODPSummary) => {
    setSelectedODP(odp);
    pageRouter.push('/map');
  }, [setSelectedODP, pageRouter]);

  const routerMap = useMemo(
    () => Object.fromEntries(routers.map((r) => [r.id, r.name])),
    [routers]
  );
  const techMap = useMemo(
    () => Object.fromEntries(technicians.map((t) => [t.id, t.name])),
    [technicians]
  );

  const filtered = useMemo(() => {
    let list = odps;
    if (statusFilter === "normal") list = list.filter((o) => o.is_active && !o.fault_suspected);
    else if (statusFilter === "fault") list = list.filter((o) => o.fault_suspected);
    else if (statusFilter === "inactive") list = list.filter((o) => !o.is_active);
    if (portFilter === "available")
      list = list.filter((o) => o.total_ports && (o.used_ports ?? 0) < o.total_ports);
    else if (portFilter === "full")
      list = list.filter((o) => o.total_ports && (o.used_ports ?? 0) >= o.total_ports);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.ip_address ?? "").includes(q) ||
          (o.serial ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [odps, statusFilter, portFilter, search]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayed = filtered.slice(startIndex, startIndex + itemsPerPage);

  const normalCount = useMemo(() => odps.filter((o) => o.is_active && !o.fault_suspected).length, [odps]);
  const faultCount = useMemo(() => odps.filter((o) => o.fault_suspected).length, [odps]);
  const inactiveCount = useMemo(() => odps.filter((o) => !o.is_active).length, [odps]);

  const hasFilter = statusFilter !== "all" || portFilter !== "all" || !!search;

  const visiblePages = useMemo(() => {
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

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Manajemen ODP</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            <span className="text-green-600 dark:text-green-400">{normalCount} Normal</span>
            {faultCount > 0 && <span className="ml-2 text-red-600 dark:text-red-400">• {faultCount} Gangguan</span>}
            {inactiveCount > 0 && <span className="ml-2 text-gray-500">• {inactiveCount} Nonaktif</span>}
            <span className="ml-2 text-gray-400">— Total {odps.length} ODP</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={smoothRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <FiRefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/optical/odp/create"
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <FiPlus className="h-4 w-4" />
            Tambah ODP
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <input
          type="text"
          placeholder="Cari nama, IP address, atau serial..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Status</option>
            <option value="normal">Normal</option>
            <option value="fault">Gangguan</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <select
            value={portFilter}
            onChange={(e) => { setPortFilter(e.target.value as typeof portFilter); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Port</option>
            <option value="available">Ada Port Kosong</option>
            <option value="full">Port Penuh</option>
          </select>
          {hasFilter && (
            <button
              onClick={() => { setStatusFilter("all"); setPortFilter("all"); setSearch(""); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Card grid */}
      {isLoading && odps.length === 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-24 text-center dark:border-gray-800 dark:bg-gray-900">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <FiWifiOff className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {hasFilter ? "Tidak ada ODP yang cocok dengan filter" : "Belum ada data ODP"}
          </p>
          {!hasFilter && (
            <Link
              href="/optical/odp/create"
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <FiPlus className="h-4 w-4" />
              Tambah ODP Pertama
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayed.map((odp) => (
            <ODPCard
              key={odp.id}
              odp={odp}
              routerName={odp.mikrotik_id ? routerMap[odp.mikrotik_id] : undefined}
              techName={odp.technician_id ? techMap[odp.technician_id] : undefined}
              onDelete={handleDelete}
              isDeleting={deletingId === odp.id}
              onViewMap={handleViewMap}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)} dari {filtered.length}
            {hasFilter && filtered.length < odps.length && (
              <span className="ml-1 text-gray-400">(dari {odps.length})</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronsLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronLeft className="h-4 w-4" />
            </button>
            {visiblePages.map((page, i) =>
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
  );
}
