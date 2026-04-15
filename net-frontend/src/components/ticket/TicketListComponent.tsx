"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FiRefreshCw,
  FiPlus,
  FiSearch,
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";
import { useTickets } from "@/lib/hooks/useTickets";
import { TicketFilters, TicketStatus, TicketCategory } from "@/lib/api/ticket";
import { TicketStatusBadge, TicketPriorityBadge } from "./TicketStatusBadge";
import { TicketRowActions } from "./TicketRowActions";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES: { value: TicketCategory | ""; label: string }[] = [
  { value: "", label: "Semua Kategori" },
  { value: "INTERNET_DOWN", label: "Internet Down" },
  { value: "LOS", label: "LOS" },
  { value: "SLOW", label: "Lambat" },
  { value: "NO_SIGNAL", label: "No Signal" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "BILLING", label: "Tagihan" },
  { value: "OTHER", label: "Lainnya" },
];

const STATUSES: { value: TicketStatus | ""; label: string }[] = [
  { value: "", label: "Semua Status" },
  { value: "OPEN", label: "Terbuka" },
  { value: "ASSIGNED", label: "Di-assign" },
  { value: "IN_PROGRESS", label: "Dikerjakan" },
  { value: "RESOLVED", label: "Selesai" },
  { value: "CLOSED", label: "Ditutup" },
];

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function TicketListComponent() {
  const [apiFilters, setApiFilters] = useState<TicketFilters>({});
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { user } = useAuth();
  const { tickets, loading, refresh } = useTickets(apiFilters);

  const hasFilter = !!apiFilters.status || !!apiFilters.overdue || !!apiFilters.category || !!search.trim();

  const filtered = useMemo(() => {
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.ticket_number.toLowerCase().includes(q) ||
        t.customer_name.toLowerCase().includes(q) ||
        (t.mikrotik_ref ?? "").toLowerCase().includes(q)
    );
  }, [tickets, search]);

  const { openCount, inProgressCount, overdueCount } = useMemo(
    () =>
      tickets.reduce(
        (acc, t) => {
          if (t.status === "OPEN") acc.openCount++;
          if (t.status === "IN_PROGRESS" || t.status === "ASSIGNED") acc.inProgressCount++;
          if (t.is_overdue) acc.overdueCount++;
          return acc;
        },
        { openCount: 0, inProgressCount: 0, overdueCount: 0 }
      ),
    [tickets]
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayed = filtered.slice(startIndex, startIndex + itemsPerPage);

  const visiblePageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const selectClass =
    "rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Cari tiket, nomor, pelanggan, MikroTik ref..."
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={apiFilters.status ?? ""}
            onChange={(e) => {
              setApiFilters((f) => ({
                ...f,
                status: (e.target.value as TicketStatus) || undefined,
              }));
              setCurrentPage(1);
            }}
            className={selectClass}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={apiFilters.category ?? ""}
            onChange={(e) => {
              setApiFilters((f) => ({ ...f, category: (e.target.value as TicketCategory) || undefined }));
              setCurrentPage(1);
            }}
            className={selectClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <input
              type="checkbox"
              checked={apiFilters.overdue ?? false}
              onChange={(e) => {
                setApiFilters((f) => ({ ...f, overdue: e.target.checked || undefined }));
                setCurrentPage(1);
              }}
              className="rounded border-gray-300"
            />
            Overdue saja
          </label>

          {hasFilter && (
            <button
              onClick={() => {
                setApiFilters({});
                setSearch("");
                setCurrentPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              Reset Filter
            </button>
          )}

          <div className="ml-auto flex gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <FiRefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <Link
              href="/tickets/create"
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
            >
              <FiPlus className="h-3.5 w-3.5" />
              Buat Tiket
            </Link>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Daftar Tiket
                </h2>
                {loading && tickets.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {openCount > 0 && (
                  <span className="text-blue-600 dark:text-blue-400">{openCount} Terbuka</span>
                )}
                {inProgressCount > 0 && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400">• {inProgressCount} Dikerjakan</span>
                )}
                {overdueCount > 0 && (
                  <span className="ml-2 text-red-600 dark:text-red-400">• {overdueCount} Overdue</span>
                )}
                <span className="ml-2 text-gray-400">Total: {tickets.length}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nomor</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Judul / Pelanggan</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Kategori</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Prioritas</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">SLA</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Dibuat</th>
                <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/2">
              {loading && tickets.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                        <div
                          className="h-4 rounded bg-gray-200 dark:bg-gray-700"
                          style={{ width: j === 0 ? 100 : 80 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : displayed.length > 0 ? (
                displayed.map((t) => (
                  <tr
                    key={t.id}
                    className={`transition-colors hover:bg-gray-50 dark:hover:bg-white/2 ${
                      t.is_overdue ? "bg-red-50/60 dark:bg-red-900/10" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {t.ticket_number}
                      </Link>
                      {t.is_overdue && (
                        <span className="ml-1 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          OVERDUE
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 md:px-6 md:py-4 max-w-[200px] truncate">
                      <Link href={`/tickets/${t.id}`} className="block">
                        <span className="text-sm font-medium text-gray-900 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400">
                          {t.title}
                        </span>
                        <span className="block text-xs text-gray-400">{t.customer_name}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      {t.category.replace(/_/g, " ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <TicketPriorityBadge priority={t.priority} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs hidden md:table-cell">
                      <span className={t.is_overdue ? "font-medium text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}>
                        {formatDateTime(t.sla_deadline)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs text-gray-400 dark:text-gray-500 hidden lg:table-cell">
                      {formatDateTime(t.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                      <TicketRowActions
                        ticket={t}
                        currentUserRole={user?.role ?? ""}
                        onRefresh={refresh}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-4">
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <FiAlertCircle className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {hasFilter
                          ? "Tidak ada tiket yang cocok dengan filter"
                          : "Belum ada tiket"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)} dari {filtered.length}
                {hasFilter && filtered.length < tickets.length && (
                  <span className="ml-1 text-gray-400">(difilter dari {tickets.length})</span>
                )}
              </span>
              <span className="text-gray-300">|</span>
              <label className="flex items-center gap-1.5">
                <span>Per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronLeft className="h-4 w-4" />
              </button>
              {visiblePageNumbers.map((page, i) =>
                page === "..." ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
                ) : (
                  <button key={page} onClick={() => setCurrentPage(page as number)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      currentPage === page
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}>
                    {page}
                  </button>
                )
              )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <FiChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
