"use client";
import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { OpticalApi } from "@/lib/api/genieacs";
import type { OpticalAlert, OpticalSeverity, OpticalAlertType } from "@/types/optical.types";

function severityColor(severity: OpticalSeverity) {
  switch (severity) {
    case "critical": return "bg-red-500";
    case "warning":  return "bg-orange-400";
    default:         return "bg-blue-400";
  }
}

function severityBadge(severity: OpticalSeverity) {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "warning":  return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default:         return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
}

function alertTypeLabel(t: OpticalAlertType) {
  switch (t) {
    case "rx_below_threshold":  return "RX Power Lemah";
    case "tx_below_threshold":  return "TX Power Lemah";
    case "odp_fault_suspected": return "ODP Fault";
    case "device_unreachable":  return "Perangkat Tidak Terjangkau";
    default: return t;
  }
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}d yang lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hr lalu`;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<OpticalAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const activeAlerts = alerts.filter((a) => !a.resolved_at);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await OpticalApi.listAlerts();
      setAlerts(data.filter((a) => !a.resolved_at).slice(0, 10));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleOpen = () => {
    setIsOpen((v) => !v);
    if (!isOpen) fetchAlerts();
  };

  return (
    <div className="relative">
      <button
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleOpen}
      >
        {activeAlerts.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {activeAlerts.length > 9 ? "9+" : activeAlerts.length}
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Alert Jaringan
            </h5>
            {activeAlerts.length > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {activeAlerts.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition dropdown-toggle dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg className="fill-current" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading && activeAlerts.length === 0 ? (
            <li className="flex items-center justify-center py-10 text-sm text-gray-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-700 dark:border-t-gray-300 mr-2" />
              Memuat alert...
            </li>
          ) : activeAlerts.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-10 text-sm text-gray-400 dark:text-gray-500">
              <svg className="mb-2 h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tidak ada alert aktif
            </li>
          ) : (
            activeAlerts.map((alert) => (
              <li key={alert.id}>
                <DropdownItem
                  onItemClick={() => setIsOpen(false)}
                  className="flex gap-3 rounded-lg border-b border-gray-100 px-3 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className={`h-2.5 w-2.5 rounded-full ${severityColor(alert.severity)}`} />
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="mb-1 flex items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${severityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                        {alertTypeLabel(alert.alert_type)}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {alert.message}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-400 dark:text-gray-500">
                      {timeAgo(alert.last_seen_at)}
                    </span>
                  </span>
                </DropdownItem>
              </li>
            ))
          )}
        </ul>

        <Link
          href="/optical/alerts"
          className="mt-3 block rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => setIsOpen(false)}
        >
          Lihat Semua Alert
        </Link>
      </Dropdown>
    </div>
  );
}
