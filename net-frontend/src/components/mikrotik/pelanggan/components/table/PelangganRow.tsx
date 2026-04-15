"use client";

import { memo, useRef, useEffect, useState } from "react";
import { FiLock, FiUnlock, FiWifiOff, FiEye, FiUser, FiAlertCircle } from "react-icons/fi";
import { SweetAlert } from "@/lib/sweetalert";
import { TypeBadge } from "../badges/TypeBadge";
import { StatusBadge } from "../badges/StatusBadge";
import { timeAgo } from "../utils/timeAgo";
import { RowProps } from "../types";

export const PelangganRow = memo(function PelangganRow({
  p,
  index,
  startIndex,
  loadingId,
  kelolaLoading,
  customer,
  invoice,
  onIsolir,
  onUnIsolir,
  onBlock,
  onBayar: _onBayar,
  onKelola,
}: RowProps) {
  const prevRef = useRef<typeof p>(p);
  const [flash, setFlash] = useState<"green" | "amber" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    const changed = prev.is_isolir !== p.is_isolir || prev.status !== p.status;
    prevRef.current = p;
    if (!changed) return;
    const color: "green" | "amber" = p.is_isolir ? "amber" : "green";
    const t = setTimeout(() => {
      setFlash(color);
      setTimeout(() => setFlash(null), 900);
    }, 0);
    return () => clearTimeout(t);
  }, [p]);

  const flashClass =
    flash === "green"
      ? "animate-row-flash-green"
      : flash === "amber"
        ? "animate-row-flash-amber"
        : "";

  const displayName = p.comment || p.name || p.id;
  const isIncomplete = customer !== undefined && !customer.wa_number;

  const billBadge = customer
    ? invoice
      ? invoice.status === "PAID"
        ? { label: "Sudah Bayar", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" }
        : invoice.status === "OVERDUE"
          ? { label: "Jatuh Tempo", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
          : { label: "Belum Bayar", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" }
      : { label: "Belum Ada Tagihan", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" }
    : null;

  return (
    <tr className={`transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] ${flashClass}`}>
      {/* # */}
      <td className={`px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-4 text-sm text-gray-500 dark:text-gray-400 ${isIncomplete ? "border-l-[3px] border-yellow-400 dark:border-yellow-500" : ""}`}>
        {startIndex + index + 1}
      </td>
      
      {/* Komentar / Nama - Mobile */}
      <td className="px-2 py-3 sm:px-3 sm:py-2 md:px-6 md:py-4 sm:hidden">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {displayName}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {p.ip || p.name || "-"}{customer?.package_name ? ` • ${customer.package_name}` : ""}
          </span>
          {isIncomplete && (
            <button
              onClick={() => {
                const missing = [
                  !customer!.wa_number && "WhatsApp",
                ].filter(Boolean).join(", ");
                SweetAlert.warning(
                  "Profil Belum Lengkap",
                  `${displayName} belum mengisi: ${missing}. Klik Kelola untuk melengkapi.`
                );
              }}
              className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50"
            >
              <FiAlertCircle className="h-2.5 w-2.5" />
              <span>!</span>
            </button>
          )}
        </div>
      </td>

      {/* Komentar / Nama - Desktop */}
      <td className="px-3 py-2 md:px-6 md:py-4 hidden sm:table-cell">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white/90">
            {displayName}
          </span>
          {isIncomplete && (
            <button
              onClick={() => {
                const missing = [
                  !customer!.wa_number && "WhatsApp",
                ].filter(Boolean).join(", ");
                SweetAlert.warning(
                  "Profil Belum Lengkap",
                  `${displayName} belum mengisi: ${missing}. Klik Kelola untuk melengkapi.`
                );
              }}
              className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50"
            >
              <FiAlertCircle className="h-2.5 w-2.5" />
              <span>Profil Belum Lengkap</span>
            </button>
          )}
        </div>
      </td>
      
      {/* Tipe - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden sm:table-cell">
        <TypeBadge type={p.type} />
      </td>
      
      {/* Paket - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-600 dark:text-gray-400 hidden md:table-cell">
        {customer?.package_name || "—"}
      </td>
      
      {/* IP - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 font-mono text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
        {p.ip || "—"}
      </td>
      
      {/* MAC - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 font-mono text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
        {p.mac || "—"}
      </td>
      
      {/* Status - center aligned */}
      <td className="px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-4 text-center">
        <StatusBadge status={p.status} isIsolir={p.is_isolir} />
      </td>
      
      {/* Tagihan - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden md:table-cell">
        {billBadge ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${billBadge.cls}`}>
            {billBadge.label}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      
      {/* Last Seen - desktop only */}
      <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
        {p.last_seen ? timeAgo(p.last_seen) : "—"}
      </td>
      
      {/* Aksi */}
      <td className="px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-4 text-right">
        <div className="flex items-center justify-end gap-1 sm:gap-1.5">
          {p.is_isolir ? (
            <button
              onClick={() => onUnIsolir(p)}
              disabled={loadingId}
              className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-100 text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 sm:h-6 sm:w-6"
              title="Buka Isolir"
            >
              {loadingId
                ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                : <FiUnlock className="h-2.5 w-2.5" />}
            </button>
          ) : (
            <>
              <button
                onClick={() => onIsolir(p)}
                disabled={loadingId}
                title="Isolir"
                className="inline-flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-orange-700 transition-colors hover:bg-orange-200 disabled:opacity-50 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 sm:h-6 sm:w-6"
              >
                {loadingId
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                  : <FiLock className="h-3 w-3" />}
              </button>
              {/* Block button */}
              {p.status === "UP" && (
                <button
                  onClick={() => onBlock(p)}
                  disabled={loadingId}
                  title="Block Sekarang"
                  className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 sm:h-6 sm:w-6"
                >
                  {loadingId
                    ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                    : <FiWifiOff className="h-2.5 w-2.5" />}
                </button>
              )}
            </>
          )}
          
          {/* Detail / Kelola */}
          <button
            onClick={() => onKelola(p)}
            disabled={kelolaLoading}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-brand-200 bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-400 dark:hover:bg-brand-900/40 sm:h-7 sm:w-7"
            title="Detail / Kelola"
          >
            {kelolaLoading
              ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              : <FiUser className="h-2.5 w-2.5" />}
          </button>
        </div>
      </td>
    </tr>
  );
});
