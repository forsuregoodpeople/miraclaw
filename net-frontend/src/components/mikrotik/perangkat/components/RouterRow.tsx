"use client";

import React from "react";
import { FiPower, FiTerminal, FiWifi, FiWifiOff, FiRefreshCw } from "react-icons/fi";
import { MikrotikRouter } from "@/lib/api/mikrotik";

interface RouterRowProps {
  router: MikrotikRouter;
  index: number;
  canCRUD: boolean;
  realTimeStatus: "up" | "down" | "unknown";
  hasRealtimeConnection: boolean;
  lastUpdateTime: Date | null;
  onEdit: (router: MikrotikRouter) => void;
  onDelete: (id: number, name: string) => void;
  onTerminal: (router: MikrotikRouter) => void;
}

export function RouterRow({
  router,
  index,
  canCRUD,
  realTimeStatus,
  hasRealtimeConnection,
  lastUpdateTime,
  onEdit,
  onDelete,
  onTerminal,
}: RouterRowProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "up":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "down":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "pinging":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "unknown":
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "up":
        return <FiWifi className="h-3 w-3 mr-1" />;
      case "down":
        return <FiWifiOff className="h-3 w-3 mr-1" />;
      case "pinging":
        return <FiRefreshCw className="h-3 w-3 mr-1 animate-spin" />;
      default:
        return <FiRefreshCw className="h-3 w-3 mr-1" />;
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-3 py-2 md:px-6 md:py-4 text-sm text-gray-900 dark:text-white/90">
        {index + 1}
      </td>
      <td className="px-3 py-2 md:px-6 md:py-4 text-sm font-medium text-gray-900 dark:text-white/90 max-w-[120px] md:max-w-none truncate" title={router.name}>
        {router.name}
      </td>
      <td className="hidden md:table-cell px-3 py-2 md:px-6 md:py-4 text-sm text-gray-600 dark:text-gray-400">
        {router.host}
      </td>
      <td className="hidden lg:table-cell px-3 py-2 md:px-6 md:py-4 text-sm text-gray-600 dark:text-gray-400">
        {router.port}
      </td>
      <td className="px-3 py-2 md:px-6 md:py-4 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(realTimeStatus)}`}
          >
            {getStatusIcon(realTimeStatus)}
            {realTimeStatus === "up"
              ? "Terhubung"
              : realTimeStatus === "down"
              ? "Terputus"
              : router.status || "Tidak Diketahui"}
          </span>
          {router.is_active && hasRealtimeConnection && (
            <div className="hidden sm:flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {lastUpdateTime?.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-2 md:px-6 md:py-4 text-sm">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            router.is_active
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
          }`}
        >
          {router.is_active ? (
            <FiPower className="h-3 w-3 mr-1" />
          ) : (
            <FiPower className="h-3 w-3 mr-1 opacity-50" />
          )}
          {router.is_active ? "Aktif" : "Nonaktif"}
        </span>
      </td>
      {canCRUD && (
        <td className="px-3 py-2 md:px-6 md:py-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onTerminal(router)}
              className="rounded-lg bg-purple-500 p-1.5 text-xs font-medium text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
              title="Terminal"
            >
              <span className="flex items-center gap-1">
                <FiTerminal className="h-3 w-3" />
                <span className="hidden sm:inline">Terminal</span>
              </span>
            </button>
            <button
              onClick={() => onEdit(router)}
              className="rounded-lg bg-brand-500 px-2 py-1.5 md:px-3 text-xs font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(router.id, router.name)}
              className="rounded-lg bg-error-500 px-2 py-1.5 md:px-3 text-xs font-medium text-white hover:bg-error-600 dark:bg-error-600 dark:hover:bg-error-700"
            >
              Hapus
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
