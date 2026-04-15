"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useMikrotikResources } from "@/lib/hooks/useMikrotikResources";
import { classifyWebSocketError, getWebSocketErrorDisplay } from "@/lib/utils/websocket-errors";

export function DashboardComponent({
  routerId,
  routerName,
}: {
  routerId: number;
  routerName: string;
}) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: resources, isConnected, error, lastUpdate } = useMikrotikResources({
    routerId,
    enabled: true,
  });

  const loading = !resources && !error;
  const errorType = classifyWebSocketError(error, isConnected, isAuthenticated && !authLoading, routerId);
  const errorDisplay = getWebSocketErrorDisplay(errorType, routerId, routerName);

  const formatBytes = (bytes: string): string => {
    const value = parseFloat(bytes);
    if (isNaN(value) || value === 0) return "0 B";
    
    const units = ["B", "KB", "MB", "GB"];
    let index = 0;
    
    let convertedValue = value;
    while (convertedValue >= 1024 && index < units.length - 1) {
      convertedValue /= 1024;
      index++;
    }
        let decimalPlaces = 2;
    if (convertedValue >= 100) decimalPlaces = 0;
    else if (convertedValue >= 10) decimalPlaces = 1;
    
    return `${convertedValue.toFixed(decimalPlaces)} ${units[index]}`;
  };

  const parseCpuLoad = (load: string): number => {
    const value = parseFloat(load);
    return isNaN(value) ? 0 : value;
  };

  const calculateMemoryUsage = (free: string, total: string): number => {
    const freeValue = parseFloat(free);
    const totalValue = parseFloat(total);
    if (isNaN(freeValue) || isNaN(totalValue) || totalValue === 0) return 0;
    return ((totalValue - freeValue) / totalValue) * 100;
  };

  const calculateDiskUsage = (free: string, total: string): number => {
    const freeValue = parseFloat(free);
    const totalValue = parseFloat(total);
    if (isNaN(freeValue) || isNaN(totalValue) || totalValue === 0) return 0;
    return ((totalValue - freeValue) / totalValue) * 100;
  };

  const getCpuColor = (load: number): string => {
    if (load < 50) return "bg-emerald-500";
    if (load < 75) return "bg-amber-500";
    return "bg-rose-500";
  };

  const getMemoryColor = (usage: number): string => {
    if (usage < 70) return "bg-emerald-500";
    if (usage < 85) return "bg-amber-500";
    return "bg-rose-500";
  };

  const getDiskColor = (usage: number): string => {
    if (usage < 80) return "bg-emerald-500";
    if (usage < 90) return "bg-amber-500";
    return "bg-rose-500";
  };

  const showSkeleton = loading || !resources;

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-800 dark:text-white/90">
            {routerName}
          </h3>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Error
            </span>
          </div>
        </div>
        <div className="rounded bg-rose-50 p-3 dark:bg-rose-900/20">
          <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">
            {errorDisplay.title}
          </p>
          <p className="text-xs text-rose-500 mt-2">
            {errorDisplay.description}
          </p>
          {errorDisplay.action && errorDisplay.actionUrl && (
            <a
              href={errorDisplay.actionUrl}
              className="text-xs text-rose-600 font-medium hover:text-rose-700 underline mt-3 inline-block"
            >
              {errorDisplay.action} →
            </a>
          )}
        </div>
      </div>
    );
  }



  // Cek apakah data tersedia (router aktif)
  const hasCpuData = resources?.["cpu-load"] !== undefined && resources?.["cpu-load"] !== "";
  const cpuLoad = hasCpuData ? parseCpuLoad(resources?.["cpu-load"] || "0") : 0;
  
  const hasMemoryData = resources?.["free-memory"] && resources?.["total-memory"];
  const memoryUsage = hasMemoryData ? calculateMemoryUsage(resources?.["free-memory"] || "0", resources?.["total-memory"] || "0") : 0;
  
  const hasDiskData = resources?.["free-hdd-space"] && resources?.["total-hdd-space"];
  const diskUsage = hasDiskData ? calculateDiskUsage(resources?.["free-hdd-space"] || "0", resources?.["total-hdd-space"] || "0") : 0;
  
  // Cek apakah ada metrik yang tersedia
  const hasAnyMetrics = hasCpuData || hasMemoryData || hasDiskData;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-gray-800 dark:text-white/90">
            {routerName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isConnected ? "Live" : "Disconnected"}
            </span>
            {lastUpdate && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                • Updated: {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          #{routerId}
        </span>
      </div>

       <div className="space-y-4">
        {/* Jika tidak ada metrik sama sekali */}
        {!hasAnyMetrics ? (
          <div className="text-center py-6">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-500 mt-2">
              Router tidak aktif atau belum ada data metrik
            </p>
          </div>
        ) : (
          <>
            {/* CPU - hanya tampilkan jika ada data */}
            {hasCpuData && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">CPU Load</span>
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {cpuLoad.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getCpuColor(cpuLoad)}`}
                    style={{ width: `${Math.min(cpuLoad, 100)}%` }}
                  />
                </div>
              </div>
            )}

        {/* Memory - hanya tampilkan jika ada data */}
        {hasMemoryData && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Memory</span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {memoryUsage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getMemoryColor(memoryUsage)}`}
                style={{ width: `${Math.min(memoryUsage, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatBytes(resources["free-memory"])} free / {formatBytes(resources["total-memory"])} total
            </div>
          </div>
        )}

        {/* Disk - hanya tampilkan jika ada data */}
        {hasDiskData && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Disk</span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {diskUsage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getDiskColor(diskUsage)}`}
                style={{ width: `${Math.min(diskUsage, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatBytes(resources["free-hdd-space"])} free / {formatBytes(resources["total-hdd-space"])} total
            </div>
          </div>
        )}
          </>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-3 mt-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-gray-500 dark:text-gray-400 mb-1">Board</p>
            <p className="font-medium text-gray-800 dark:text-white/90 truncate">
              {resources?.["board-name"] || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 mb-1">Version</p>
            <p className="font-medium text-gray-800 dark:text-white/90 truncate">
              {resources?.["version"] || "N/A"}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-500 dark:text-gray-400 mb-1">Uptime</p>
            <p className="font-medium text-gray-800 dark:text-white/90 truncate">
              {resources?.["uptime"] || "N/A"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}