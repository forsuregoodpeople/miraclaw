"use client";

import { useState, useEffect } from "react";
import { FiX, FiSave } from "react-icons/fi";
import { PackageApi, Package, CreatePackageRequest, UpdatePackageRequest } from "@/lib/api/packages";
import { MikrotikApi, MikrotikRouter } from "@/lib/api/mikrotik";
import { usePPPoEProfiles } from "@/lib/hooks/usePPPoEProfiles";
import { useDHCPServers } from "@/lib/hooks/useDHCPServers";
import { SweetAlert } from "@/lib/sweetalert";

const TYPE_BADGE: Record<string, string> = {
  PPPOE:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DHCP:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

interface Props {
  package?: Package; // undefined = create mode
  onClose: () => void;
  onSaved: () => void;
}

export function PackageModal({ package: pkg, onClose, onSaved }: Props) {
  const isEdit = !!pkg;

  const [name, setName]                       = useState(pkg?.name ?? "");
  const [description, setDescription]         = useState(pkg?.description ?? "");
  const [connectionType, setConnectionType]   = useState<"PPPOE" | "DHCP" | "STATIC">(pkg?.connection_type ?? "PPPOE");
  const [routerId, setRouterId]               = useState<number>(pkg?.router_id ?? 0);
  const [profileName, setProfileName]         = useState(pkg?.mikrotik_profile_name ?? "");
  const [routers, setRouters]                 = useState<MikrotikRouter[]>([]);
  const [saving, setSaving]                   = useState(false);

  const { data: pppoeProfiles } = usePPPoEProfiles({ routerId, enabled: connectionType === "PPPOE" && routerId > 0 });
  const { data: dhcpServers }   = useDHCPServers({ routerId, enabled: (connectionType === "DHCP" || connectionType === "STATIC") && routerId > 0 });

  const profileOptions = connectionType === "PPPOE"
    ? pppoeProfiles.map((p) => p.name)
    : dhcpServers.map((s) => s.name);

  useEffect(() => {
    MikrotikApi.findAll().then(setRouters).catch(() => {});
  }, []);

  // Reset profile when type or router changes (create mode only)
  useEffect(() => {
    if (!isEdit) setProfileName("");
  }, [connectionType, routerId, isEdit]);

  const handleSave = async () => {
    if (!name.trim()) {
      SweetAlert.error("Validasi", "Nama paket wajib diisi");
      return;
    }
    if (routerId <= 0) {
      SweetAlert.error("Validasi", "Router wajib dipilih");
      return;
    }
    if (!profileName) {
      SweetAlert.error("Validasi", "Nama profil MikroTik wajib dipilih");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && pkg) {
        const req: UpdatePackageRequest = { name, description, mikrotik_profile_name: profileName };
        await PackageApi.update(pkg.id, req);
      } else {
        const req: CreatePackageRequest = { name, description, connection_type: connectionType, router_id: routerId, mikrotik_profile_name: profileName };
        await PackageApi.create(req);
      }
      await SweetAlert.success("Berhasil", `Paket berhasil ${isEdit ? "diperbarui" : "ditambahkan"}`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {isEdit ? "Edit Paket" : "Tambah Paket"}
              </h3>
              {isEdit && (
                <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[pkg.connection_type] ?? ""}`}>
                  {pkg.connection_type}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nama Paket <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: 10 Mbps Basic"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Opsional"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipe Koneksi <span className="text-red-500">*</span>
              </label>
              <select
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value as "PPPOE" | "DHCP" | "STATIC")}
                disabled={isEdit}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              >
                <option value="PPPOE">PPPoE</option>
                <option value="DHCP">DHCP</option>
                <option value="STATIC">Static</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Router <span className="text-red-500">*</span>
              </label>
              <select
                value={routerId}
                onChange={(e) => setRouterId(Number(e.target.value))}
                disabled={isEdit}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              >
                <option value={0}>— Pilih Router —</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Profil MikroTik <span className="text-red-500">*</span>
              </label>
              {routerId > 0 && profileOptions.length > 0 ? (
                <select
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                >
                  <option value="">— Pilih Profil —</option>
                  {profileOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={routerId <= 0 ? "Pilih router terlebih dahulu" : "Memuat profil..."}
                  disabled={routerId <= 0}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                />
              )}
              <p className="mt-1 text-xs text-gray-400">
                Profil diambil langsung dari MikroTik dan divalidasi saat disimpan.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <FiSave className="h-4 w-4" />
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
