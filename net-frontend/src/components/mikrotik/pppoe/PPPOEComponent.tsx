"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MikrotikRouter, MikrotikApi, PPPOESecret } from "@/lib/api/mikrotik";
import { PPPOETableComponent } from "@/components/mikrotik/pppoe/PPPOETableComponent";
import { SweetAlert } from "@/lib/sweetalert";
import { FiPlus, FiX, FiUser } from "react-icons/fi";

const EMPTY_SECRET: Partial<PPPOESecret> = {
  name: "",
  password: "",
  profile: "default",
  service: "pppoe",
  local_address: "",
  remote_address: "",
  comment: "",
  disabled: false,
};

export function PPPOEMonitoringClient() {
  const router = useRouter();
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [isLoadingRouters, setIsLoadingRouters] = useState(true);
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null);
  const [isAddSecretModalOpen, setIsAddSecretModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<Partial<PPPOESecret>>(EMPTY_SECRET);

  const activeRouters = routers.filter(r => r.is_active);
  const selectedRouter = routers.find(r => r.id === selectedRouterId);

  useEffect(() => {
    const fetchRouters = async () => {
      try {
        const data = await MikrotikApi.findAll();
        setRouters(data);
        const active = data.filter(r => r.is_active);
        if (active.length > 0) {
          setSelectedRouterId(prev => prev ?? active[0].id);
        }
      } catch {
        SweetAlert.error("Error", "Gagal memuat data router");
      } finally {
        setIsLoadingRouters(false);
      }
    };
    fetchRouters();
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsAddSecretModalOpen(false);
    setNewSecret(EMPTY_SECRET);
  }, []);

  const handleAddSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId) return;
    setIsCreating(true);
    try {
      await MikrotikApi.createPPPOESecret(selectedRouterId, newSecret);
      SweetAlert.success("Berhasil", "Secret PPPoE berhasil ditambahkan");
      handleCloseModal();
    } catch {
      SweetAlert.error("Error", "Gagal menambahkan secret PPPoE");
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setNewSecret(prev => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  useEffect(() => {
    if (!isAddSecretModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseModal(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [isAddSecretModalOpen, handleCloseModal]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitoring PPPoE</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Monitoring session PPPoE real-time dan manajemen secret
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/mikrotik/pppoe/profile")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
          >
            <FiUser className="h-4 w-4" />
            Kelola Profile
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Pilih Router
        </label>
        {isLoadingRouters ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        ) : activeRouters.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300">
            {routers.length === 0
              ? "Tidak ada router tersedia. Silakan tambah router terlebih dahulu."
              : "Tidak ada router aktif tersedia. Silakan aktifkan router di halaman manajemen router."}
          </div>
        ) : (
          <select
            value={selectedRouterId ?? ""}
            onChange={(e) => setSelectedRouterId(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {activeRouters.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.host}:{r.port})
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoadingRouters ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      ) : selectedRouterId && selectedRouter ? (
        <PPPOETableComponent
        key={selectedRouterId}
          routerId={selectedRouterId}
          routerName={selectedRouter.name}
        />
      ) : activeRouters.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-800/50">
          <p className="text-gray-500 dark:text-gray-400">
            Silakan pilih router aktif untuk melihat session PPPoE
          </p>
        </div>
      ) : null}

    </div>
  );
}
