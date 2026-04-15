"use client";

import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, PaymentFormData } from "@/lib/schema";
import { usePayments } from "@/lib/hooks/useFinance";
import { SweetAlert } from "@/lib/sweetalert";
import { FinanceApi, Payment, UpdatePaymentRequest } from "@/lib/api/finance";
import { MikrotikRouter } from "@/lib/api/mikrotik";
import { Customer } from "@/lib/api/customer";
import { CustomerPickerModal } from "@/components/finance/CustomerPickerModal";
import {
  FiPlus, FiUpload, FiX, FiUser, FiRefreshCw,
  FiChevronsLeft, FiChevronsRight, FiChevronLeft, FiChevronRight,
  FiInbox, FiTrash2, FiEdit2, FiSave,
} from "react-icons/fi";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";

const PAGE_SIZES = [10, 25, 50];

const PAYMENT_METHODS = [
  { value: "CASH",     label: "Tunai" },
  { value: "TRANSFER", label: "Transfer Bank" },
  { value: "E-WALLET", label: "E-Wallet" },
] as const;

const formatRupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

const MONTHS = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

function PeriodPicker({
  value,
  onChange,
  inputClass,
}: {
  value: string;
  onChange: (val: string) => void;
  inputClass: string;
}) {
  const parts = value ? value.split("-") : [String(new Date().getFullYear()), String(new Date().getMonth() + 1).padStart(2, "0")];
  const year = parts[0];
  const month = parts[1];
  return (
    <div className="flex gap-1.5">
      <select
        value={month}
        onChange={(e) => onChange(`${year}-${e.target.value}`)}
        className={inputClass}
      >
        {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <input
        type="number"
        value={year}
        min={2020}
        max={2099}
        onChange={(e) => onChange(`${e.target.value.padStart(4, "0")}-${month}`)}
        className={`w-20 ${inputClass}`}
      />
    </div>
  );
}

const METHOD_BADGE: Record<string, string> = {
  CASH:      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  TRANSFER:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "E-WALLET":"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const STATUS_BADGE: Record<string, string> = {
  UNPAID:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PAID:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Edit Payment Modal ───────────────────────────────────────────────────────

function EditPaymentModal({
  payment,
  onClose,
  onSave,
}: {
  payment: Payment;
  onClose: () => void;
  onSave: (id: number, data: UpdatePaymentRequest) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const initialForm = useMemo<UpdatePaymentRequest>(() => ({
    customer_name:  payment.customer_name,
    amount:         payment.amount,
    payment_method: payment.payment_method,
    payment_date:   payment.payment_date.slice(0, 10),
    billing_period: payment.billing_period,
    note:           payment.note ?? "",
  }), [payment]);
  const [form, setForm] = useState<UpdatePaymentRequest>(initialForm);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave(payment.id, {
        ...form,
        payment_date: form.payment_date ? new Date(form.payment_date).toISOString() : form.payment_date,
      });
      SweetAlert.success("Berhasil", "Pembayaran berhasil diperbarui");
      onClose();
    } catch {
      SweetAlert.error("Gagal", "Terjadi kesalahan saat menyimpan perubahan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Pembayaran</h3>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Pelanggan</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah (Rp) <span className="text-red-500">*</span></label>
              <input
                type="number"
                min={1}
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Metode <span className="text-red-500">*</span></label>
              <select
                required
                value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value as UpdatePaymentRequest["payment_method"] }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Periode Tagihan <span className="text-red-500">*</span></label>
              <PeriodPicker
                value={form.billing_period}
                onChange={(v) => setForm((f) => ({ ...f, billing_period: v }))}
                inputClass="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Bayar <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={form.payment_date}
                onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Catatan</label>
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setForm(initialForm)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              Reset
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              Batal
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
              {submitting ? (
                <><FiRefreshCw className="h-4 w-4 animate-spin" />Menyimpan...</>
              ) : (
                <><FiSave className="h-4 w-4" />Simpan</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Payment History Table ────────────────────────────────────────────────────

function PaymentHistoryTable({
  payments,
  loading,
  period,
  onPeriodChange,
  onDelete,
  onEdit,
}: {
  payments: Payment[];
  loading: boolean;
  period: string;
  onPeriodChange: (p: string) => void;
  onDelete: (p: Payment) => void;
  onEdit: (p: Payment) => void;
}) {
  const [searchQuery, setSearchQuery]   = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [currentPage, setCurrentPage]   = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = useMemo(() => {
    let list = payments;
    if (methodFilter !== "all") list = list.filter((p) => p.payment_method === methodFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.customer_name.toLowerCase().includes(q) ||
          p.billing_period.includes(q) ||
          (p.note && p.note.toLowerCase().includes(q))
      );
    }
    return list;
  }, [payments, methodFilter, searchQuery]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex  = (currentPage - 1) * itemsPerPage;
  const paginated   = filtered.slice(startIndex, startIndex + itemsPerPage);
  const hasFilter   = methodFilter !== "all" || !!searchQuery;

  const visiblePages = useMemo(() => {
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

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Riwayat Pembayaran</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Total: {payments.length} pembayaran
              {hasFilter && filtered.length < payments.length && (
                <span className="ml-1 text-gray-400">(difilter: {filtered.length})</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
        {/* Period picker */}
        <div className="flex items-center gap-1.5">
          <label className="whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">Periode:</label>
          <PeriodPicker
            value={period}
            onChange={(v) => { onPeriodChange(v); setCurrentPage(1); }}
            inputClass="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm text-brand-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari pelanggan, periode, catatan..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">Semua Metode</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {hasFilter && (
          <button
            onClick={() => { setSearchQuery(""); setMethodFilter("all"); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pelanggan</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Jumlah</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Metode</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Periode</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Tanggal</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Bukti</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
            {loading && payments.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`} className="animate-pulse">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                      <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 1 ? 120 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length > 0 ? (
              paginated.map((p, i) => (
                <tr key={p.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500">{startIndex + i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-medium text-gray-900 dark:text-white/90">{p.customer_name}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{formatRupiah(p.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden sm:table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${METHOD_BADGE[p.payment_method] ?? ""}`}>
                      {PAYMENT_METHODS.find((m) => m.value === p.payment_method)?.label ?? p.payment_method}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 font-mono text-xs text-gray-500 hidden md:table-cell">{p.billing_period}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs text-gray-500 hidden md:table-cell">
                    {new Date(p.payment_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 hidden lg:table-cell">
                    {p.receipt_path ? (
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}${p.receipt_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      >
                        Lihat
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(p)}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                        title="Edit pembayaran"
                      >
                        <FiEdit2 className="h-3 w-3" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        title="Hapus pembayaran"
                      >
                        <FiTrash2 className="h-3 w-3" />
                        <span className="hidden sm:inline">Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <FiInbox className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {hasFilter ? "Tidak ada pembayaran yang cocok" : "Belum ada riwayat pembayaran"}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > itemsPerPage && (
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span>{startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)} dari {filtered.length}</span>
            <span className="text-gray-300">|</span>
            <label className="flex items-center gap-1.5">
              Per halaman:
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronsLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronLeft className="h-4 w-4" />
            </button>
            {visiblePages.map((page, i) =>
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
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
              <FiChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LoketComponent() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const { payments, loading, createPayment, updatePayment, deletePayment } = usePayments(period);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const handleUpdatePayment = useCallback(async (id: number, data: UpdatePaymentRequest) => {
    await updatePayment(id, data);
  }, [updatePayment]);
  const handleDeletePayment = useCallback(async (p: Payment) => {
    const r1 = await SweetAlert.confirm(
      "Hapus Pembayaran",
      `Hapus pembayaran ${p.customer_name} sebesar ${formatRupiah(p.amount)}?`
    );
    if (!r1.isConfirmed) return;
    const r2 = await SweetAlert.confirm(
      "Konfirmasi Ulang",
      "Tindakan ini tidak dapat dibatalkan. Lanjutkan?"
    );
    if (!r2.isConfirmed) return;
    try {
      await deletePayment(p.id);
      SweetAlert.success("Berhasil", "Pembayaran berhasil dihapus");
    } catch {
      SweetAlert.error("Gagal", "Terjadi kesalahan saat menghapus pembayaran");
    }
  }, [deletePayment]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [showPicker, setShowPicker]         = useState(false);
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedRouter, setSelectedRouter]     = useState<MikrotikRouter | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: "CASH",
      payment_date:   new Date().toISOString(),
      billing_period: new Date().toISOString().slice(0, 7),
      receipt: null,
    },
  });

  const paymentMethod = useWatch({ control, name: "payment_method" });
  const needsReceipt  = paymentMethod === "TRANSFER" || paymentMethod === "E-WALLET";

  const defaultValues = {
    payment_method: "CASH" as const,
    payment_date:   new Date().toISOString(),
    billing_period: new Date().toISOString().slice(0, 7),
    receipt: null,
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    setSelectedRouter(null);
    setPreviewUrl(null);
    reset(defaultValues);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setValue("receipt", file, { shouldValidate: true });
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const clearFile = () => {
    setValue("receipt", null, { shouldValidate: true });
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePickCustomer = async (customer: Customer, router: MikrotikRouter) => {
    setSelectedCustomer(customer);
    setSelectedRouter(router);
    setValue("customer_id", customer.id, { shouldValidate: true });
    try {
      const invoices = await FinanceApi.getInvoices({ customer_id: customer.id });
      const unpaid = invoices.find((inv) => inv.status === "UNPAID" || inv.status === "OVERDUE");
      if (unpaid) {
        setValue("billing_period", unpaid.billing_period, { shouldValidate: false });
        setValue("amount", unpaid.amount_due, { shouldValidate: false });
      }
    } catch {
      // silently ignore — form keeps default values
    }
  };

  const onSubmit = async (data: PaymentFormData) => {
    try {
      await createPayment({
        ...data,
        customer_name: selectedCustomer?.name ?? "",
        receipt:   data.receipt ?? undefined,
        router_id: selectedRouter?.id ?? undefined,
      });
      SweetAlert.success("Berhasil", "Pembayaran berhasil dicatat");
      closeModal();
    } catch {
      SweetAlert.error("Gagal", "Terjadi kesalahan saat menyimpan pembayaran");
    }
  };

  const totalRevenue = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  return (
    <div className="space-y-6">
      {/* ── Summary Header ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Loket Pembayaran</h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400">{payments.length} pembayaran</span>
                {!loading && (
                  <span className="ml-2 text-gray-500">• Total: {formatRupiah(totalRevenue)}</span>
                )}
              </p>
            </div>
            <button
              onClick={openModal}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              <FiPlus className="h-4 w-4" />
              Catat Pembayaran
            </button>
          </div>
        </div>
      </div>

      {/* ── History Table ── */}
      <PaymentHistoryTable payments={payments} loading={loading} period={period} onPeriodChange={setPeriod} onDelete={handleDeletePayment} onEdit={setEditingPayment} />

      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSave={handleUpdatePayment}
        />
      )}

      {/* ── Create Modal ── */}
      {isModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Catat Pembayaran Baru</h3>
              <button onClick={closeModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[75vh] overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Customer picker */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pelanggan <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-700"
                    >
                      <FiUser className="h-4 w-4" />
                      {selectedCustomer ? "Ganti Pelanggan" : "Pilih Pelanggan"}
                    </button>
                    {selectedCustomer && (
                      <div className="flex flex-1 items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-brand-800 dark:bg-brand-900/20">
                        <div>
                          <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {selectedCustomer.name}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">
                            #{selectedCustomer.id} · {selectedCustomer.type}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedCustomer(null); setSelectedRouter(null); setValue("customer_id", 0); }}
                          className="ml-2 text-gray-400 hover:text-gray-600"
                        >
                          <FiX className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input type="hidden" {...register("customer_id")} />
                  {errors.customer_id && (
                    <p className="mt-1 text-xs text-red-500">{errors.customer_id.message}</p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Jumlah (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="150000"
                    {...register("amount", { valueAsNumber: true })}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                  />
                  {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
                </div>

                {/* Payment method */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Metode Pembayaran <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register("payment_method")}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  {errors.payment_method && <p className="mt-1 text-xs text-red-500">{errors.payment_method.message}</p>}
                </div>

                {/* Billing period */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Periode Tagihan <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="billing_period"
                    control={control}
                    render={({ field }) => (
                      <PeriodPicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        inputClass="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                      />
                    )}
                  />
                  {errors.billing_period && <p className="mt-1 text-xs text-red-500">{errors.billing_period.message}</p>}
                </div>

                {/* Payment date */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tanggal Pembayaran <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="payment_date"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="date"
                        value={field.value ? field.value.slice(0, 10) : ""}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
                        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                      />
                    )}
                  />
                  {errors.payment_date && <p className="mt-1 text-xs text-red-500">{errors.payment_date.message}</p>}
                </div>

                {/* Note */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Catatan</label>
                  <textarea
                    {...register("note")}
                    rows={2}
                    placeholder="Opsional"
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                  />
                </div>

                {/* Receipt — only for TRANSFER / E-WALLET */}
                {needsReceipt && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bukti Transfer / Pembayaran <span className="text-red-500">*</span>
                    </label>
                    {previewUrl ? (
                      <div className="relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Preview bukti" className="h-32 w-auto rounded-lg border border-gray-200 object-cover dark:border-gray-700" />
                        <button
                          type="button"
                          onClick={clearFile}
                          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                        >
                          <FiX className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white p-6 text-center transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-700">
                        <FiUpload className="mb-2 h-6 w-6 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Klik untuk unggah foto bukti</span>
                        <span className="mt-1 text-xs text-gray-400">JPG, PNG, WebP — maks. 5 MB</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    )}
                    {errors.receipt && <p className="mt-1 text-xs text-red-500">{errors.receipt.message as string}</p>}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
                >
                  <FiPlus className="h-4 w-4" />
                  {isSubmitting ? "Menyimpan..." : "Catat Pembayaran"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPicker && (
        <CustomerPickerModal
          onSelect={handlePickCustomer}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
