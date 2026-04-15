"use client";

import { useState, useCallback, useMemo } from "react";
import axios from "axios";
import {
  FiUsers,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiPlus,
  FiX,
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/lib/hooks/useUsers";
import { z } from "zod";
import { updateUserSchema } from "@/lib/schema";
import { UserApi, CreateUserRequest, UpdateUserRequest, User } from "@/lib/api/users";
import { SweetAlert } from "@/lib/sweetalert";

const ROLE_OPTIONS = [
  { value: "superadmin", label: "Super Admin" },
  { value: "mitra", label: "Mitra" },
  { value: "admin", label: "Admin" },
  { value: "teknisi", label: "Teknisi" },
];

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  mitra: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  admin: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  teknisi: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

type ModalMode = "create" | "edit";

// Create user schema with confirm password
const createUserSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter"),
  name: z.string().min(3, "Nama minimal 3 karakter"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter"),
  confirmPassword: z.string().min(1, "Konfirmasi password harus diisi"),
  role: z.string().min(1, "Peran harus dipilih"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password dan konfirmasi password tidak cocok",
  path: ["confirmPassword"],
});

export function UsersTableComponent() {
  const { user: currentUser } = useAuth();
  const { users, loading, refresh } = useUsers();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<CreateUserRequest & UpdateUserRequest & { confirmPassword: string }>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const canCreate = currentUser?.role === "superadmin" || currentUser?.role === "mitra";
  const canEdit = currentUser?.role === "superadmin" || currentUser?.role === "mitra";
  const canDelete = currentUser?.role === "superadmin" || currentUser?.role === "mitra";

  const availableRoles = useMemo(() => {
    if (currentUser?.role === "superadmin") return ROLE_OPTIONS;
    if (currentUser?.role === "mitra")
      return ROLE_OPTIONS.filter((r) => r.value === "admin" || r.value === "teknisi");
    return [];
  }, [currentUser?.role]);

  const filterRoles = useMemo(() => {
    if (currentUser?.role === "mitra")
      return ROLE_OPTIONS.filter(
        (r) => r.value === "mitra" || r.value === "admin" || r.value === "teknisi"
      );
    return ROLE_OPTIONS;
  }, [currentUser?.role]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchQuery, roleFilter]);

  const openCreateModal = useCallback(() => {
    setModalMode("create");
    setEditingUser(null);
    setFormData({ role: availableRoles[0]?.value ?? "" });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsModalOpen(true);
  }, [availableRoles]);

  const openEditModal = useCallback((user: User) => {
    setModalMode("edit");
    setEditingUser(user);
    setFormData({ name: user.name, role: user.role });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setFormData({});
    setEditingUser(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (modalMode === "create") {
      const result = createUserSchema.safeParse(formData);
      if (!result.success) {
        const first = result.error.issues[0];
        return SweetAlert.error("Validasi Gagal", first.message);
      }
    } else {
      const result = updateUserSchema.safeParse(formData);
      if (!result.success) {
        const first = result.error.issues[0];
        return SweetAlert.error("Validasi Gagal", first.message);
      }
    }

    setSubmitting(true);
    try {
      if (modalMode === "create") {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { confirmPassword, ...createData } = formData as CreateUserRequest & { confirmPassword: string };
        await UserApi.create({ ...createData, email: "" });
        SweetAlert.success("Berhasil", "Pengguna berhasil dibuat");
      } else if (editingUser) {
        await UserApi.update(editingUser.id, formData as UpdateUserRequest);
        SweetAlert.success("Berhasil", "Pengguna berhasil diperbarui");
      }
      closeModal();
      refresh(true);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as Record<string, unknown> | undefined;
        const msg = data?.message as string | undefined;
        const validationErrors = Array.isArray(data?.data)
          ? (data!.data as { field: string; message: string }[])
              .map((e) => `${e.field}: ${e.message}`)
              .join(", ")
          : null;
        if (status === 400 && validationErrors) {
          SweetAlert.error("Validasi Gagal", validationErrors);
        } else if (status === 403) {
          SweetAlert.error("Akses Ditolak", msg ?? "Anda tidak memiliki izin");
        } else {
          SweetAlert.error("Gagal", msg ?? "Terjadi kesalahan");
        }
      } else {
        SweetAlert.error("Gagal", "Terjadi kesalahan");
      }
    } finally {
      setSubmitting(false);
    }
  }, [modalMode, formData, editingUser, closeModal, refresh]);

  const handleDelete = useCallback(
    async (user: User) => {
      const result = await SweetAlert.confirm(
        "Hapus Pengguna",
        `Apakah Anda yakin ingin menghapus pengguna "${user.name}"?`
      );
      if (result.isConfirmed) {
        try {
          await UserApi.delete(user.id);
          SweetAlert.success("Berhasil", "Pengguna berhasil dihapus");
          refresh(true);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const msg = error.response?.data?.message;
            if (status === 403) SweetAlert.error("Akses Ditolak", msg ?? "Anda tidak memiliki izin");
            else SweetAlert.error("Gagal", msg ?? "Terjadi kesalahan");
          } else {
            SweetAlert.error("Gagal", "Terjadi kesalahan");
          }
        }
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari username atau nama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 sm:w-56"
            />
          </div>
          {/* Role filter */}
          <div className="relative">
            <FiFilter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">Semua Peran</option>
              {filterRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <FiPlus className="h-4 w-4" />
            Tambah Pengguna
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {/* Table Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center gap-2">
            <FiUsers className="h-4 w-4 text-brand-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Daftar Pengguna
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {filteredUsers.length} pengguna ditemukan
                {filteredUsers.length !== users.length && (
                  <span className="ml-1 text-gray-400">(dari {users.length})</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">#</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">Username</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">Nama</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">Peran</th>
                <th className="hidden whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6 lg:table-cell">Dibuat</th>
                {(canEdit || canDelete) && (
                  <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
              {loading && users.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3 md:px-6 md:py-4">
                        <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 24 : j === 1 ? 100 : j === 2 ? 140 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-2 md:px-6 md:py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiUsers className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {searchQuery || roleFilter !== "all"
                          ? "Tidak ada pengguna yang cocok dengan filter"
                          : "Tidak ada pengguna"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr key={user.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-gray-400 md:px-6 md:py-4">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900 dark:text-white/90 md:px-6 md:py-4">
                      {user.username}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700 dark:text-gray-300 md:px-6 md:py-4">
                      {user.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 md:px-6 md:py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${ROLE_BADGE[user.role] ?? "bg-gray-100 text-gray-700"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-gray-400 md:px-6 md:py-4 lg:table-cell">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="whitespace-nowrap px-3 py-3 text-sm md:px-6 md:py-4">
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(user)}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                              title="Edit"
                            >
                              <FiEdit2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(user)}
                              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                              title="Hapus"
                            >
                              <FiTrash2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Hapus</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {modalMode === "create" ? "Tambah Pengguna" : "Edit Pengguna"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-6">
              <div className="space-y-4">
                {modalMode === "create" && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.username ?? ""}
                      onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      placeholder="Masukkan username"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>

                {modalMode === "create" && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={formData.password ?? ""}
                          onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          placeholder="Min. 8 karakter"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Konfirmasi Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={formData.confirmPassword ?? ""}
                          onChange={(e) => setFormData((p) => ({ ...p, confirmPassword: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          placeholder="Ketik ulang password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showConfirmPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Role field */}
                {modalMode === "edit" && editingUser && !availableRoles.some((r) => r.value === editingUser.role) ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Peran
                    </label>
                    <input
                      type="text"
                      value={editingUser.role}
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm capitalize text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Peran <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.role ?? ""}
                      onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      {availableRoles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : modalMode === "create" ? "Buat Pengguna" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
