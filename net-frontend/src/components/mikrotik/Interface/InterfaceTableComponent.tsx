"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { MikrotikRouter, MikrotikApi, InterfaceData } from "@/lib/api/mikrotik";
import { useMikrotikInterfaces } from "@/lib/hooks/useMikrotikInterfaces";
import { SweetAlert } from "@/lib/sweetalert";
import { FiSave, FiX, FiEdit, FiPower, FiRefreshCw } from "react-icons/fi";

interface InterfaceTableProps {
  routerId: number;
  routerName: string;
}

function InterfaceTable({ routerId, routerName }: InterfaceTableProps) {
  const handleMessage = useCallback((data: InterfaceData[]) => {
    console.log("Data interface diperbarui:", data.length, "interface");
  }, []);

  const handleError = useCallback((err: Event) => {
    console.error("WebSocket error:", err);
  }, []);

  const { data: interfaces, isConnected, error, lastUpdate, refresh, patchInterface } = useMikrotikInterfaces({
    routerId,
    enabled: true,
    onMessage: handleMessage,
    onError: handleError,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [customItemsPerPage, setCustomItemsPerPage] = useState<string>("");
  const [isCustomInput, setIsCustomInput] = useState(false);
  const [showAllMode, setShowAllMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInterface, setEditingInterface] = useState<InterfaceData | null>(null);
  const [comment, setComment] = useState("");
  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [newInterfaceName, setNewInterfaceName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "up" | "down">("up");
  const [sortBy, setSortBy] = useState<"default" | "newest_down" | "oldest_down">("default");
  const [now, setNow] = useState(new Date());

  const loading = !interfaces && !error;

  const smoothRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const parseMikrotikDate = (dateString?: string): Date | null => {
    if (!dateString) return null;
    const [datePart, timePart] = dateString.split(' ');
    if (!datePart || !timePart) return null;

    const [monthStr, day, year] = datePart.split('/');
    const months: Record<string, number> = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const month = months[monthStr.toLowerCase()];
    if (month === undefined) return null;

    const [hour, min, sec] = timePart.split(':').map(Number);
    return new Date(Number(year), month, Number(day), hour, min, sec);
  };

  const formatDowntime = (startDate: Date | null) => {
    if (!startDate) return null;
    const diffMs = now.getTime() - startDate.getTime();
    if (diffMs < 0) return "Baru Saja";

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} hari yang lalu`;
    if (diffHours > 0) return `${diffHours} jam, ${diffMins % 60} mnt yg lalu`;
    if (diffMins > 0) return `${diffMins} menit yang lalu`;
    return `${diffSecs} detik yang lalu`;
  };

  const formatBps = (bps: number | undefined | null): string => {
    if (bps === undefined || bps === null || isNaN(bps)) return "0 bps";
    if (bps === 0) return "0 bps";

    const k = 1000;
    const sizes = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${parseFloat((bps / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getStatusColor = (iface: InterfaceData) => {
    const isDisabled = iface.disabled === true || iface.disabled === "true";
    if (isDisabled) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";

    const isRunning = iface.running === true || iface.running === "true";
    return isRunning
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  };

  const getStatusText = (iface: InterfaceData) => {
    const isDisabled = iface.disabled === true || iface.disabled === "true";
    if (isDisabled) return "DISABLED";

    const isRunning = iface.running === true || iface.running === "true";
    return isRunning ? "UP" : "DOWN";
  };

  const filteredInterfaces = (interfaces || [])
    .filter((iface) => {
      const matchesSearch =
        iface.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (iface.comment && iface.comment.toLowerCase().includes(searchQuery.toLowerCase()));

      const isUp = iface.running === true || iface.running === "true";
      const matchesStatus =
        statusFilter === "all" ? true :
        statusFilter === "up" ? isUp :
        !isUp;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "default") return 0;

      const dateA = parseMikrotikDate(a["last-link-down-time"])?.getTime() || 0;
      const dateB = parseMikrotikDate(b["last-link-down-time"])?.getTime() || 0;

      const isA_Up = a.running === true || a.running === "true";
      const isB_Up = b.running === true || b.running === "true";

      if (isA_Up && isB_Up) return 0;
      if (isA_Up && !isB_Up) return 1;
      if (!isA_Up && isB_Up) return -1;

      if (sortBy === "newest_down") return dateB - dateA;
      return dateA - dateB;
    });

  const effectiveItemsPerPage = showAllMode ? filteredInterfaces.length : itemsPerPage;
  const indexOfLastItem = currentPage * effectiveItemsPerPage;
  const indexOfFirstItem = indexOfLastItem - effectiveItemsPerPage;
  const currentInterfaces = filteredInterfaces.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredInterfaces.length / effectiveItemsPerPage);

  const getEffectiveSpeed = (iface: InterfaceData, type: 'rx' | 'tx'): number => {
    const currentKey = type === 'rx' ? "rx-bps" : "tx-bps";
    return iface[currentKey] || 0;
  };

  const handleOpenModal = (iface: InterfaceData) => {
    setEditingInterface(iface);
    setComment(iface.comment || "");
    setIsModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingInterface(null);
    setComment("");
  }, []);

  const handleOpenEditNameModal = (iface: InterfaceData) => {
    setEditingInterface(iface);
    setNewInterfaceName(iface.name);
    setIsEditNameModalOpen(true);
  };

  const handleCloseEditNameModal = useCallback(() => {
    setIsEditNameModalOpen(false);
    setEditingInterface(null);
    setNewInterfaceName("");
  }, []);

  const handleSaveComment = async () => {
    if (!editingInterface) return;

    patchInterface(editingInterface.name, { comment });

    try {
      await MikrotikApi.updateInterfaceComment(routerId, editingInterface.name, comment);
      SweetAlert.success("Berhasil", "Komentar berhasil disimpan");
      handleCloseModal();
      smoothRefresh();
    } catch (error) {
      smoothRefresh();
      SweetAlert.error("Error", "Gagal menyimpan komentar");
    }
  };

  const handleSaveInterfaceName = async () => {
    if (!editingInterface || !newInterfaceName.trim()) return;

    const result = await SweetAlert.confirm(
      "Ganti Nama Interface",
      `Apakah Anda yakin ingin mengganti nama interface "${editingInterface.name}" menjadi "${newInterfaceName}"?`
    );

    if (result.isConfirmed) {
      patchInterface(editingInterface.name, { name: newInterfaceName.trim() });

      try {
        await MikrotikApi.renameInterface(routerId, editingInterface.name, newInterfaceName.trim());
        SweetAlert.success("Berhasil", "Nama interface berhasil diganti");
        handleCloseEditNameModal();
        smoothRefresh();
      } catch (error) {
        smoothRefresh();
        SweetAlert.error("Error", "Gagal mengganti nama interface");
      }
    }
  };

  const handleToggleStatus = async (iface: InterfaceData) => {
    const isCurrentlyDisabled = iface.disabled === true || iface.disabled === "true";
    const action = isCurrentlyDisabled ? "mengaktifkan" : "menonaktifkan";
    const actionLabel = isCurrentlyDisabled ? "Aktifkan" : "Nonaktifkan";

    const result = await SweetAlert.confirm(
      `${actionLabel} Interface`,
      `Apakah Anda yakin ingin ${action} interface "${iface.name}"?`
    );

    if (result.isConfirmed) {
      const newDisabledVal = !isCurrentlyDisabled ? "true" : "false";
      const newRunningVal = !isCurrentlyDisabled ? "false" : "true";
      patchInterface(iface.name, { disabled: newDisabledVal, running: newRunningVal });

      try {
        await MikrotikApi.toggleInterfaceStatus(routerId, iface.name, !isCurrentlyDisabled);
        SweetAlert.success("Berhasil", `Interface berhasil di${actionLabel.toLowerCase()}`);
        smoothRefresh();
      } catch (error) {
        smoothRefresh();
        SweetAlert.error("Error", `Gagal ${action} interface`);
      }
    }
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isModalOpen) handleCloseModal();
        if (isEditNameModalOpen) handleCloseEditNameModal();
      }
    };

    if (isModalOpen || isEditNameModalOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isModalOpen, isEditNameModalOpen, handleCloseModal, handleCloseEditNameModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative w-full max-w-sm">
            <input
              type="text"
              placeholder="Cari nama atau komentar interface..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "up" | "down");
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">Semua Status</option>
            <option value="up">Sedang Aktif</option>
            <option value="down">Sedang Mati</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as "default" | "oldest_down" | "newest_down");
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="default">Urutan Default</option>
            <option value="newest_down">Terbaru Mati</option>
            <option value="oldest_down">Terlama Mati</option>
          </select>
        </div>
      </div>

      <div className={`overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 transition-opacity duration-200 ${isRefreshing ? 'opacity-60' : 'opacity-100'}`}>
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Interface — {routerName}
                </h3>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">
                  {(interfaces ?? []).filter(i => i.running === true || i.running === "true").length} Aktif
                </span>
                {(interfaces ?? []).filter(i => i.running === false || i.running === "false").length > 0 && (
                  <span className="ml-2 text-gray-500">
                    • {(interfaces ?? []).filter(i => i.running === false || i.running === "false").length} Putus
                  </span>
                )}
                <span className="ml-2 text-gray-400">Total: {interfaces?.length || 0}</span>
                {lastUpdate && (
                  <span className="ml-2">
                    • Diperbarui: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {isConnected ? 'Terhubung' : 'Terputus'}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Nama</th>
                <th className="hidden sm:table-cell px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Tipe</th>
                <th className="px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Status</th>
                <th className="hidden md:table-cell px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Kecepatan RX</th>
                <th className="hidden md:table-cell px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Kecepatan TX</th>
                <th className="hidden lg:table-cell px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">MTU</th>
                <th className="hidden lg:table-cell px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Komentar</th>
                <th className="px-3 py-2 md:px-6 md:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
              {!interfaces || interfaces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 md:px-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {!isConnected ? 'Menghubungkan ke WebSocket...' : 'Belum ada data interface tersedia'}
                  </td>
                </tr>
              ) : filteredInterfaces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 md:px-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Tidak ada interface yang cocok dengan pencarian / filter Anda.
                  </td>
                </tr>
              ) : (
                currentInterfaces.map((iface, index) => {
                  const isDown = iface.running === false || iface.running === "false";
                  const downtimeStart = isDown ? parseMikrotikDate(iface["last-link-down-time"]) : null;

                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[120px] md:max-w-none truncate" title={iface.name}>{iface.name}</span>
                          <button
                            onClick={() => handleOpenEditNameModal(iface)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                            title="Ganti Nama Interface"
                          >
                            <FiEdit className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
                        {iface.type}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(iface)}`}>
                            {getStatusText(iface)}
                          </span>
                          {isDown && downtimeStart && (
                            <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                              Mati: {formatDowntime(downtimeStart)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden md:table-cell whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className={`font-mono font-semibold ${getEffectiveSpeed(iface, 'rx') > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-600'}`}>
                          {formatBps(getEffectiveSpeed(iface, 'rx'))}
                        </div>
                      </td>
                      <td className="hidden md:table-cell whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className={`font-mono font-semibold ${getEffectiveSpeed(iface, 'tx') > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>
                          {formatBps(getEffectiveSpeed(iface, 'tx'))}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300">
                        {iface.mtu}
                      </td>
                      <td className="hidden lg:table-cell whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {iface.comment || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(iface)}
                            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                            title="Edit Komentar"
                          >
                            <span className="hidden sm:inline">Edit</span>
                            <FiEdit className="h-3 w-3 sm:hidden" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(iface)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${
                              iface.disabled === true || iface.disabled === "true"
                                ? "bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                                : "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                            }`}
                            title={iface.disabled === true || iface.disabled === "true" ? "Aktifkan Interface" : "Nonaktifkan Interface"}
                          >
                            <FiPower className="h-3 w-3" />
                            <span className="hidden sm:inline">{iface.disabled === true || iface.disabled === "true" ? "Aktifkan" : "Nonaktifkan"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {interfaces && interfaces.length > 0 && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                <span>
                  Menampilkan {filteredInterfaces.length > 0 ? indexOfFirstItem + 1 : 0}–{Math.min(indexOfLastItem, filteredInterfaces.length)} dari {filteredInterfaces.length} interface
                </span>
                <span className="text-gray-400">|</span>
                <label className="flex items-center gap-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Per halaman:</span>
                  {isCustomInput ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={customItemsPerPage}
                        onChange={(e) => setCustomItemsPerPage(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(customItemsPerPage);
                          if (val > 0 && val <= 10000) {
                            setItemsPerPage(val);
                            setCurrentPage(1);
                          }
                          setIsCustomInput(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = parseInt(customItemsPerPage);
                            if (val > 0 && val <= 10000) {
                              setItemsPerPage(val);
                              setCurrentPage(1);
                            }
                            setIsCustomInput(false);
                          }
                        }}
                        className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        placeholder="Jumlah"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          const val = parseInt(customItemsPerPage);
                          if (val > 0 && val <= 10000) {
                            setItemsPerPage(val);
                            setCurrentPage(1);
                          }
                          setIsCustomInput(false);
                        }}
                        className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <select
                      value={showAllMode ? "all" : itemsPerPage}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "custom") {
                          setIsCustomInput(true);
                          setCustomItemsPerPage("");
                          setShowAllMode(false);
                        } else if (value === "all") {
                          setShowAllMode(true);
                          setItemsPerPage(filteredInterfaces.length > 0 ? filteredInterfaces.length : 10);
                          setCurrentPage(1);
                        } else {
                          setShowAllMode(false);
                          setItemsPerPage(Number(value));
                          setCurrentPage(1);
                        }
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={1000}>1000</option>
                      <option value="all">Semua ({filteredInterfaces.length})</option>
                      <option value="custom">Kustom...</option>
                    </select>
                  )}
                </label>
                {showAllMode && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    (Menampilkan semua {filteredInterfaces.length} data)
                  </span>
                )}
              </div>

              {!showAllMode && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      currentPage === 1
                        ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    Pertama
                  </button>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      currentPage === 1
                        ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    Sebelumnya
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                            currentPage === pageNum
                              ? "bg-brand-500 text-white"
                              : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      currentPage === totalPages
                        ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    Berikutnya
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      currentPage === totalPages
                        ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                        : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    Terakhir
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isModalOpen && editingInterface && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                Edit Komentar — {editingInterface.name}
              </h3>
              <button
                onClick={handleCloseModal}
                className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <FiX className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nama Interface
                  </label>
                  <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                    {editingInterface.name}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <div className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(editingInterface)}`}>
                    {getStatusText(editingInterface)}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Kecepatan RX / TX Saat Ini
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="font-mono text-gray-900 dark:text-white">
                      RX: {formatBps(getEffectiveSpeed(editingInterface, 'rx'))}
                      {getEffectiveSpeed(editingInterface, 'rx') > 0 && editingInterface["rx-bps"] === 0 && (
                        <span className="ml-1 text-xs text-gray-400">(terakhir)</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="font-mono text-gray-900 dark:text-white">
                      TX: {formatBps(getEffectiveSpeed(editingInterface, 'tx'))}
                      {getEffectiveSpeed(editingInterface, 'tx') > 0 && editingInterface["tx-bps"] === 0 && (
                        <span className="ml-1 text-xs text-gray-400">(terakhir)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Komentar
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                  placeholder="Tambahkan komentar untuk interface ini..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveComment}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                >
                  <FiSave className="h-4 w-4" />
                  Simpan Komentar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditNameModalOpen && editingInterface && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                Ganti Nama Interface
              </h3>
              <button
                onClick={handleCloseEditNameModal}
                className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <FiX className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-sm text-gray-600 dark:text-gray-400">Detail Interface Saat Ini</div>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Nama Saat Ini</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {editingInterface.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
                    <div className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(editingInterface)}`}>
                      {getStatusText(editingInterface)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nama Interface Baru
                </label>
                <input
                  type="text"
                  value={newInterfaceName}
                  onChange={(e) => setNewInterfaceName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                  placeholder="Masukkan nama interface baru..."
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Catatan: Ini akan mengganti nama interface langsung di router Mikrotik
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseEditNameModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveInterfaceName}
                  disabled={!newInterfaceName.trim() || newInterfaceName === editingInterface.name}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    !newInterfaceName.trim() || newInterfaceName === editingInterface.name
                      ? "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      : "bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                  }`}
                >
                  Ganti Nama
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterfaceTableComponent() {
  const { isAuthenticated } = useAuth();
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const activeRouters = routers.filter(r => r.is_active);

  useEffect(() => {
    const fetchRouters = async () => {
      try {
        const data = await MikrotikApi.findAll();
        setRouters(data);

        const activeRouters = data.filter(r => r.is_active);
        if (activeRouters.length > 0) {
          setSelectedRouterId(activeRouters[0].id);
        }
      } catch (error) {
        console.error("Gagal mengambil data router:", error);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchRouters();
    }
  }, [isAuthenticated]);

  const selectedRouter = routers.find(r => r.id === selectedRouterId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Pilih Router
        </label>
        {activeRouters.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300">
            Tidak ada router aktif. Silakan aktifkan router terlebih dahulu di halaman manajemen router.
          </div>
        ) : (
          <select
            value={selectedRouterId || ""}
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

      {selectedRouterId && selectedRouter ? (
        <InterfaceTable
          key={selectedRouterId}
          routerId={selectedRouterId}
          routerName={selectedRouter.name}
        />
      ) : activeRouters.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-800/50">
          <p className="text-gray-500 dark:text-gray-400">
            Silakan pilih router aktif untuk melihat daftar interface
          </p>
        </div>
      ) : null}
    </div>
  );
}
