"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { PPPoEApi, PPPoEProfile } from "@/lib/api/pppoe";
import { useAuth } from "@/context/AuthContext";
import { usePPPoEProfiles } from "@/lib/hooks/usePPPoEProfiles";
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
  FiUser,
} from "react-icons/fi";

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

// ─── Profile Row ───────────────────────────────────────────────────────────────
interface ProfileRowProps {
  profile: PPPoEProfile & { usage?: number };
  index: number;
  startIndex: number;
  onEdit: (profile: PPPoEProfile) => void;
  onDelete: (profileName: string) => void;
}

const ProfileRow = React.memo(function ProfileRow({
  profile,
  index,
  startIndex,
  onEdit,
  onDelete,
}: ProfileRowProps) {
  return (
    <tr className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400">
        {startIndex + index + 1}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {profile.name}
          </span>
          {profile.usage !== undefined && profile.usage > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {profile.usage} pengguna
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
        {profile.local_address || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
        {profile.remote_address || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
        {profile.rate_limit ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {profile.rate_limit}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
        {profile.bridge || "-"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(profile)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            title="Edit Profile"
          >
            <FiEdit2 className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(profile.name)}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            title="Hapus Profile"
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
export default function PPPoEProfilePage() {
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
  const [editingProfile, setEditingProfile] = useState<PPPoEProfile | null>(null);
  const [formData, setFormData] = useState<Partial<PPPoEProfile>>({
    name: "",
    local_address: "",
    remote_address: "",
    rate_limit: "",
    bridge: "",
    incoming_filter: "",
    outgoing_filter: "",
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

  // Fetch profiles
  const { data: profiles = [], isLoading: isLoadingProfiles, refetch: refetchProfiles } = usePPPoEProfiles({
    routerId: selectedRouterId || 0,
    enabled: !!selectedRouterId,
  });

  // Fetch profile usage
  const [profileUsage, setProfileUsage] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!selectedRouterId) return;
    PPPoEApi.getProfileUsage(selectedRouterId)
      .then(setProfileUsage)
      .catch(() => setProfileUsage({}));
  }, [selectedRouterId, profiles]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const smoothRefetch = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchProfiles();
      if (selectedRouterId) {
        const usage = await PPPoEApi.getProfileUsage(selectedRouterId);
        setProfileUsage(usage);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refetchProfiles, selectedRouterId]);

  const handleCloseModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingProfile(null);
    setFormData({
      name: "",
      local_address: "",
      remote_address: "",
      rate_limit: "",
      bridge: "",
      incoming_filter: "",
      outgoing_filter: "",
    });
    setIsSaving(false);
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setFormData({
      name: "",
      local_address: "",
      remote_address: "",
      rate_limit: "",
      bridge: "",
      incoming_filter: "",
      outgoing_filter: "",
    });
    setIsCreateModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((profile: PPPoEProfile) => {
    setEditingProfile(profile);
    setFormData({ ...profile });
    setIsEditModalOpen(true);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || isSaving) return;
    if (!formData.name) {
      SweetAlert.error("Error", "Nama profile harus diisi");
      return;
    }

    setIsSaving(true);
    try {
      await PPPoEApi.createProfile(selectedRouterId, formData);
      SweetAlert.success("Berhasil", "PPPoE Profile berhasil ditambahkan");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menambahkan PPPoE Profile";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !editingProfile || isSaving) return;

    setIsSaving(true);
    try {
      await PPPoEApi.updateProfile(selectedRouterId, editingProfile.name, formData);
      SweetAlert.success("Berhasil", "PPPoE Profile berhasil diperbarui");
      handleCloseModal();
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal memperbarui PPPoE Profile";
      SweetAlert.error("Error", msg);
    } finally {
      setIsSaving(false);
    }
  }, [formData, editingProfile, selectedRouterId, isSaving, handleCloseModal, smoothRefetch]);

  const handleDelete = useCallback(async (profileName: string) => {
    if (!selectedRouterId) return;
    const result = await SweetAlert.confirm(
      "Hapus PPPoE Profile",
      `Apakah Anda yakin ingin menghapus profile "${profileName}"?`
    );
    if (!result.isConfirmed) return;

    try {
      await PPPoEApi.deleteProfile(selectedRouterId, profileName);
      SweetAlert.success("Berhasil", "PPPoE Profile berhasil dihapus");
      smoothRefetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.serverMessage || "Gagal menghapus PPPoE Profile";
      SweetAlert.error("Error", msg);
    }
  }, [selectedRouterId, smoothRefetch]);

  // ── Filter & Sort ───────────────────────────────────────────────────────────
  const filteredProfiles = useMemo(() => {
    let list = [...profiles];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.local_address && p.local_address.toLowerCase().includes(q)) ||
          (p.remote_address && p.remote_address.toLowerCase().includes(q)) ||
          (p.rate_limit && p.rate_limit.toLowerCase().includes(q)) ||
          (p.bridge && p.bridge.toLowerCase().includes(q))
      );
    }

    // Add usage data
    return list.map((p) => ({
      ...p,
      usage: profileUsage[p.name] || 0,
    }));
  }, [profiles, searchQuery, profileUsage]);

  const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedProfiles = filteredProfiles.slice(startIndex, startIndex + itemsPerPage);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={() => router.push("/mikrotik/pppoe")}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            <FiArrowLeft className="h-4 w-4" />
            Kembali ke PPPoE
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Manajemen PPPoE Profile
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Kelola profile PPPoE untuk paket layanan pelanggan
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
              placeholder="Cari nama, address, rate limit..."
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
          >
            <FiPlus className="h-4 w-4" />
            Tambah Profile
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <FiUser className="h-5 w-5 text-purple-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  PPPoE Profiles — {selectedRouter?.name || "-"}
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Total: {profiles.length} profile
                {filteredProfiles.length !== profiles.length && (
                  <span className="ml-2 text-gray-400">(difilter: {filteredProfiles.length})</span>
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
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nama Profile</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Local Address</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Remote Address</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rate Limit</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Bridge</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {isLoadingProfiles && profiles.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 120 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredProfiles.length > 0 ? (
                displayedProfiles.map((profile, index) => (
                  <ProfileRow
                    key={profile.name}
                    profile={profile}
                    index={index}
                    startIndex={startIndex}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiUser className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {searchQuery
                          ? "Tidak ada profile yang cocok dengan pencarian"
                          : "Tidak ada PPPoE Profile"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredProfiles.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredProfiles.length)} dari {filteredProfiles.length}
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
                Tambah PPPoE Profile
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
                    Nama Profile <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Premium-10M"
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Local Address
                  </label>
                  <input
                    type="text"
                    value={formData.local_address || ""}
                    onChange={(e) => setFormData({ ...formData, local_address: e.target.value })}
                    placeholder="192.168.100.1"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Remote Address
                  </label>
                  <input
                    type="text"
                    value={formData.remote_address || ""}
                    onChange={(e) => setFormData({ ...formData, remote_address: e.target.value })}
                    placeholder="pppoe-pool"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rate Limit
                  </label>
                  <input
                    type="text"
                    value={formData.rate_limit || ""}
                    onChange={(e) => setFormData({ ...formData, rate_limit: e.target.value })}
                    placeholder="10M/10M"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-400">Format: download/upload (contoh: 10M/10M atau 1M/512k)</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Bridge
                  </label>
                  <input
                    type="text"
                    value={formData.bridge || ""}
                    onChange={(e) => setFormData({ ...formData, bridge: e.target.value })}
                    placeholder="bridge-local"
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
                  className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-purple-600 dark:hover:bg-purple-700">
                  {isSaving ? <><FiLoader className="h-4 w-4 animate-spin" />Menyimpan...</> : <><FiSave className="h-4 w-4" />Simpan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingProfile && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit PPPoE Profile
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
                    Nama Profile
                  </label>
                  <input
                    type="text"
                    value={editingProfile.name}
                    disabled
                    className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">Nama profile tidak dapat diubah</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Local Address
                  </label>
                  <input
                    type="text"
                    value={formData.local_address || ""}
                    onChange={(e) => setFormData({ ...formData, local_address: e.target.value })}
                    placeholder="192.168.100.1"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Remote Address
                  </label>
                  <input
                    type="text"
                    value={formData.remote_address || ""}
                    onChange={(e) => setFormData({ ...formData, remote_address: e.target.value })}
                    placeholder="pppoe-pool"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rate Limit
                  </label>
                  <input
                    type="text"
                    value={formData.rate_limit || ""}
                    onChange={(e) => setFormData({ ...formData, rate_limit: e.target.value })}
                    placeholder="10M/10M"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Bridge
                  </label>
                  <input
                    type="text"
                    value={formData.bridge || ""}
                    onChange={(e) => setFormData({ ...formData, bridge: e.target.value })}
                    placeholder="bridge-local"
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
                  className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-purple-600 dark:hover:bg-purple-700">
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
