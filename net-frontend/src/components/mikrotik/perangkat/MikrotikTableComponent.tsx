"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { User } from "@/lib/api/users";
import { MikrotikRouter, MikrotikApi, ResourceData } from "@/lib/api/mikrotik";
import { useAuth } from "@/context/AuthContext";
import { SweetAlert } from "@/lib/sweetalert";
import { redirect } from "next/navigation";
import axios from "axios";

import {
  FilterBar,
  RouterModal,
  RouterRow,
  RouterRealtimeMonitor,
} from "./components";

type StatusFilter = "all" | "active" | "inactive";

export interface MikrotikTableComponentProps {
  onRefresh?: () => void;
}

export function MikrotikTableComponent({ onRefresh }: MikrotikTableComponentProps) {
  const { user } = useAuth();
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<MikrotikRouter | null>(null);
  const [formData, setFormData] = useState<Partial<MikrotikRouter>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resourceDataMap, setResourceDataMap] = useState<Map<number, ResourceData>>(new Map());
  const [lastUpdateMap, setLastUpdateMap] = useState<Map<number, Date>>(new Map());

  const canCRUD = user?.role === "mitra" || user?.role === "superadmin";

  const getRealTimeStatus = (routerId: number): "up" | "down" | "unknown" => {
    const resourceData = resourceDataMap.get(routerId);
    if (resourceData && resourceData["cpu-load"]) {
      const cpuLoad = parseFloat(resourceData["cpu-load"]);
      if (!isNaN(cpuLoad) && cpuLoad >= 0) {
        return "up";
      }
    }
    return "unknown";
  };

  const hasRealtimeConnection = (routerId: number): boolean => {
    return resourceDataMap.has(routerId) && resourceDataMap.get(routerId) !== null;
  };

  const getLastUpdateTime = (routerId: number): Date | null => {
    return lastUpdateMap.get(routerId) || null;
  };

  const filteredRouters = useMemo(() => {
    let result = [...routers];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (router) =>
          router.name.toLowerCase().includes(query) ||
          router.host.toLowerCase().includes(query)
      );
    }

    if (statusFilter === "active") {
      result = result.filter((router) => router.is_active);
    } else if (statusFilter === "inactive") {
      result = result.filter((router) => !router.is_active);
    }

    const activeRouters = result.filter((r) => r.is_active);
    const inactiveRouters = result
      .filter((r) => !r.is_active)
      .sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateA - dateB;
      });

    return [...activeRouters, ...inactiveRouters];
  }, [routers, searchQuery, statusFilter]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingRouter(null);
    setFormData({});
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isModalOpen) {
        handleCloseModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isModalOpen, handleCloseModal]);

  const fetchRouters = async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await MikrotikApi.findAll();
      setRouters(data);

      setResourceDataMap(prev => {
        const currentIds = new Set(data.map(r => r.id));
        const newMap = new Map<number, ResourceData>();
        prev.forEach((value, key) => {
          if (currentIds.has(key)) newMap.set(key, value);
        });
        return newMap;
      });

      setLastUpdateMap(prev => {
        const currentIds = new Set(data.map(r => r.id));
        const newMap = new Map<number, Date>();
        prev.forEach((value, key) => {
          if (currentIds.has(key)) newMap.set(key, value);
        });
        return newMap;
      });
    } catch (error) {
      SweetAlert.error("Error", "Gagal memuat data router");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  const handleOpenModal = (router?: MikrotikRouter) => {
    if (router) {
      setEditingRouter(router);
      setFormData(router);
    } else {
      setEditingRouter(null);
      setFormData({
        name: "",
        host: "",
        port: 8728,
        username: "",
        password: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canCRUD) {
      SweetAlert.error("Error", "Anda tidak memiliki akses untuk menambah/edit router");
      return;
    }

    try {
      if (editingRouter) {
        await MikrotikApi.update(editingRouter.id, formData);
        SweetAlert.success("Berhasil", "Router berhasil diperbarui");
      } else {
        await MikrotikApi.create(formData as MikrotikRouter);
        SweetAlert.success("Berhasil", "Router berhasil ditambahkan");
      }
      handleCloseModal();
      fetchRouters(true);
      onRefresh?.();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;

        if (status === 401) {
          SweetAlert.error("Sesi Berakhir", "Sesi Anda telah berakhir. Silakan login kembali.");
          setTimeout(() => {
            window.location.href = "/auth";
          }, 1500);
        } else if (status === 403) {
          SweetAlert.error("Akses Ditolak", "Anda tidak memiliki izin untuk melakukan operasi ini.");
        } else if (status === 422) {
          SweetAlert.error("Data Tidak Valid", message);
        } else if (status !== undefined && status >= 500) {
          SweetAlert.error("Kesalahan Server", "Terjadi kesalahan pada server. Silakan coba lagi.");
        } else {
          SweetAlert.error("Error", message || "Gagal menyimpan router");
        }
      } else {
        SweetAlert.error("Error", "Terjadi kesalahan tidak terduga. Silakan coba lagi.");
      }
    }
  };

  const handleDelete = async (id: number, name: string) => {
    const result = await SweetAlert.confirm(
      "Hapus Router",
      `Apakah Anda yakin ingin menghapus router "${name}"?`
    );
    if (result.isConfirmed) {
      try {
        await MikrotikApi.delete(id);
        SweetAlert.success("Berhasil", "Router berhasil dihapus");
        fetchRouters(true);
        onRefresh?.();
      } catch (error) {
        SweetAlert.error("Error", "Gagal menghapus router");
      }
    }
  };

  const handleOpenTerminal = (router: MikrotikRouter) => {
    redirect(`/mikrotik/terminal?routerId=${router.id}`);
  };

  const handleResourceMessage = useCallback((data: ResourceData, routerId: number) => {
    setResourceDataMap(prev => {
      const newMap = new Map(prev);
      newMap.set(routerId, data);
      return newMap;
    });
    setLastUpdateMap(prev => {
      const newMap = new Map(prev);
      newMap.set(routerId, new Date());
      return newMap;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {routers.filter(r => r.is_active).map(router => (
        <RouterRealtimeMonitor
          key={`monitor-${router.id}`}
          routerId={router.id}
          isActive={true}
          onDataUpdate={handleResourceMessage}
        />
      ))}

      <FilterBar
        filteredCount={filteredRouters.length}
        totalCount={routers.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        canCRUD={canCRUD}
        isRefreshing={isRefreshing}
        onAddRouter={() => handleOpenModal()}
      />

      <div className={`overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 transition-opacity duration-200 ${isRefreshing ? 'opacity-60' : 'opacity-100'}`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
              <th className="px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                No
              </th>
              <th className="px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Nama
              </th>
              <th className="hidden md:table-cell px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Host
              </th>
              <th className="hidden lg:table-cell px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Port
              </th>
              <th className="px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Status
                <span className="ml-1 hidden lg:inline text-xs font-normal text-gray-400 dark:text-gray-500">
                  (Real-time)
                </span>
              </th>
              <th className="hidden sm:table-cell px-3 py-2 md:px-6 md:py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Kondisi
              </th>
              {canCRUD && (
                <th className="px-3 py-2 md:px-6 md:py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Aksi
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-white/[0.03]">
            {filteredRouters.length === 0 ? (
              <tr>
                <td
                  colSpan={canCRUD ? 7 : 6}
                  className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                >
                  {searchQuery || statusFilter !== "all"
                    ? "Tidak ada router yang sesuai dengan filter"
                    : "Tidak ada router yang ditemukan"}
                </td>
              </tr>
            ) : (
              filteredRouters.map((router, index) => (
                <RouterRow
                  key={router.id}
                  router={router}
                  index={index}
                  canCRUD={canCRUD}
                  realTimeStatus={getRealTimeStatus(router.id)}
                  hasRealtimeConnection={hasRealtimeConnection(router.id)}
                  lastUpdateTime={getLastUpdateTime(router.id)}
                  onEdit={handleOpenModal}
                  onDelete={handleDelete}
                  onTerminal={handleOpenTerminal}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <RouterModal
          editingRouter={editingRouter}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}