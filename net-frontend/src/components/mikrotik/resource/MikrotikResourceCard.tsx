"use client";

import React from "react";
import { useMikrotikResources } from "@/lib/hooks/useMikrotikResources";

export function MikrotikResourceCard({
  routerId,
  routerName,
}: {
  routerId: number;
  routerName: string;
}) {
  const { data: resources, isConnected, error, lastUpdate } = useMikrotikResources({
    routerId,
    enabled: true,
  });

  const formatBytes = (bytes: string): string => {
    const value = parseFloat(bytes);
    if (isNaN(value)) return bytes;
    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      index++;
    }
    return `${(value / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
  };

  const formatUptime = (uptime: string): string => {
    return uptime;
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
    if (load < 50) return "bg-success-500";
    if (load < 75) return "bg-warning-500";
    return "bg-error-500";
  };

  const now = new Date();

  // Force re-render when data changes
  const dataKey = resources ? JSON.stringify(resources) : 'no-data';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-white/90">
            {routerName}
          </h3>
           <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-success-500" : error ? "bg-error-500" : "bg-warning-500"
              }`}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {error ? "Auth Error" : isConnected ? (resources ? "Active" : "Connected, waiting for data...") : "Connecting..."}
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ID: {routerId}
        </span>
      </div>

       {resources && Object.keys(resources).length > 0 ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <svg className="text-gray-800 size-5 dark:text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 21.95V12.05L22 12.05V3.05H11z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">CPU Load</p>
                <div className="mt-2 flex items-center gap-3">
                  <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                    {parseCpuLoad(resources["cpu-load"])}%
                  </p>
                  <div className="flex-1">
                    <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-2.5 rounded-full ${getCpuColor(parseCpuLoad(resources["cpu-load"]))}`}
                        style={{ width: `${parseCpuLoad(resources["cpu-load"])}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <svg className="text-gray-800 size-5 dark:text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1 0v2a1 1 0 01-1 0h-1a1 1 0 01-1 0v-2a1 1 0 011 1 0h1a1 1 0 01-1 0v2a1 1 0 011 1 0H4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 7h20v2H2V7z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Memory (RAM)</p>
                <div className="mt-2 flex items-center gap-3">
                  <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                    {calculateMemoryUsage(resources["free-memory"], resources["total-memory"]).toFixed(1)}%
                  </p>
                  <div className="flex-1">
                    <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-2.5 rounded-full ${
                          calculateMemoryUsage(resources["free-memory"], resources["total-memory"]) < 80
                            ? "bg-success-500"
                            : "bg-warning-500"
                        }`}
                        style={{ width: `${calculateMemoryUsage(resources["free-memory"], resources["total-memory"])}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(resources["free-memory"])} / {formatBytes(resources["total-memory"])} available
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <svg className="text-gray-800 size-5 dark:text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7a1 1 0 011-1 0v2a1 1 0 01-1 0h-1a1 1 0 01-1 0v-2a1 1 0 011 1 0h1a1 1 0 01-1 0v2a1 1 0 011 1 0H4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 7h20v2H2V7z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Disk Space</p>
                <div className="mt-2 flex items-center gap-3">
                  <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                    {calculateDiskUsage(resources["free-hdd-space"], resources["total-hdd-space"]).toFixed(1)}%
                  </p>
                  <div className="flex-1">
                    <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-2.5 rounded-full ${
                          calculateDiskUsage(resources["free-hdd-space"], resources["total-hdd-space"]) < 80
                            ? "bg-success-500"
                            : "bg-warning-500"
                        }`}
                        style={{ width: `${calculateDiskUsage(resources["free-hdd-space"], resources["total-hdd-space"])}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(resources["free-hdd-space"])} / {formatBytes(resources["total-hdd-space"])} available
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <svg className="text-gray-800 size-5 dark:text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0-6h6" />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Uptime</p>
                <p className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                  {formatUptime(resources.uptime)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {resources["board-name"]} • RouterOS {resources.version}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {error ? `Error: ${error}` : (isConnected ? "Connected, waiting for data..." : "Connecting to WebSocket...")}
            </p>
            {lastUpdate && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Last update: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
