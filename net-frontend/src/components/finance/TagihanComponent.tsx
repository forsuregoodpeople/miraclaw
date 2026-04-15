"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, InvoiceFormData } from "@/lib/schema";
import { useInvoices, useTariff } from "@/lib/hooks/useFinance";
import { SweetAlert } from "@/lib/sweetalert";
import { Invoice, UpdateInvoiceRequest } from "@/lib/api/finance";
import { MikrotikRouter } from "@/lib/api/mikrotik";
import { Customer, CustomerApi } from "@/lib/api/customer";
import { PackageApi, Package } from "@/lib/api/packages";
import { FinanceApi } from "@/lib/api/finance";
import { CustomerPickerModal } from "@/components/finance/CustomerPickerModal";
import { WhatsAppApi, WASettings } from "@/lib/api/whatsapp";
import { useAuth } from "@/context/AuthContext";
import {
  FiPlus, FiX, FiUser, FiInbox, FiUsers,
  FiChevronsLeft, FiChevronsRight, FiChevronLeft, FiChevronRight,
  FiEdit2, FiSave, FiRefreshCw, FiMessageSquare,
} from "react-icons/fi";

const PAGE_SIZES = [10, 25, 50];

function getTriggerType(dueDate: string): "H-3" | "H-1" | "H0" | "OVERDUE" {
  const diff = Math.floor((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (diff > 1) return "H-3";
  if (diff === 1) return "H-1";
  if (diff === 0) return "H0";
  return "OVERDUE";
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function buildMessage(inv: Invoice, settings: WASettings | null): string {
  const trigger = getTriggerType(inv.due_date);
  const tpl = settings?.templates[trigger] ??
    `Halo {name}, tagihan periode {period} sebesar Rp{amount} jatuh tempo {due_date}.`;
  return renderTemplate(tpl, {
    name:     inv.customer_name,
    period:   inv.billing_period,
    amount:   inv.amount_due.toLocaleString("id-ID"),
    due_date: new Date(inv.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
  });
}

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

const STATUS_BADGE: Record<string, string> = {
  UNPAID:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PAID:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID:  "Belum Lunas",
  PAID:    "Lunas",
  OVERDUE: "Jatuh Tempo",
};

// ─── Edit Invoice Modal ───────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "UNPAID",  label: "Belum Lunas" },
  { value: "PAID",    label: "Lunas" },
  { value: "OVERDUE", label: "Jatuh Tempo" },
] as const;

function EditInvoiceModal({
  invoice,
  onClose,
  onSave,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSave: (id: number, data: UpdateInvoiceRequest) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const initialForm = useMemo<UpdateInvoiceRequest>(() => ({
    customer_name:  invoice.customer_name,
    amount_due:     invoice.amount_due,
    billing_period: invoice.billing_period,
    due_date:       invoice.due_date.slice(0, 10),
    status:         invoice.status,
  }), [invoice]);
  const [form, setForm] = useState<UpdateInvoiceRequest>(initialForm);

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
      await onSave(invoice.id, {
        ...form,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : form.due_date,
      });
      SweetAlert.success("Berhasil", "Tagihan berhasil diperbarui");
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Tagihan</h3>
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
                min={0}
                required
                value={form.amount_due}
                onChange={(e) => setForm((f) => ({ ...f, amount_due: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status <span className="text-red-500">*</span></label>
              <select
                required
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as UpdateInvoiceRequest["status"] }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Jatuh Tempo <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
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

// ─── Invoice Table ────────────────────────────────────────────────────────────

function InvoiceTable({
  invoices,
  loading,
  billingPeriod,
  onPeriodChange,
  onEdit,
  onSendWA,
  onBulkWA,
  packages,
}: {
  invoices: Invoice[];
  loading: boolean;
  billingPeriod: string;
  onPeriodChange: (p: string) => void;
  onEdit: (inv: Invoice) => void;
  onSendWA: (inv: Invoice) => void;
  onBulkWA: (invs: Invoice[]) => void;
  packages: Package[];
}) {
  const [searchQuery, setSearchQuery]   = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [packageFilter, setPackageFilter] = useState<number | null>(null);
  const [currentPage, setCurrentPage]   = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== "all") list = list.filter((inv) => inv.status === statusFilter);
    if (packageFilter !== null) list = list.filter((inv) => inv.package_id === packageFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((inv) => inv.customer_name.toLowerCase().includes(q));
    }
    return list;
  }, [invoices, statusFilter, packageFilter, searchQuery]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex  = (currentPage - 1) * itemsPerPage;
  const paginated   = filtered.slice(startIndex, startIndex + itemsPerPage);
  const hasFilter   = statusFilter !== "all" || !!searchQuery || packageFilter !== null;

  const unpaidCount  = useMemo(() => invoices.filter((i) => i.status === "UNPAID").length, [invoices]);
  const overdueCount = useMemo(() => invoices.filter((i) => i.status === "OVERDUE").length, [invoices]);
  const paidCount    = useMemo(() => invoices.filter((i) => i.status === "PAID").length, [invoices]);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Daftar Tagihan</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-yellow-600 dark:text-yellow-400">{unpaidCount} Belum Lunas</span>
              {overdueCount > 0 && <span className="ml-2 text-red-600 dark:text-red-400">• {overdueCount} Jatuh Tempo</span>}
              {paidCount > 0 && <span className="ml-2 text-green-600 dark:text-green-400">• {paidCount} Lunas</span>}
              <span className="ml-2 text-gray-400">Total: {invoices.length}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
        {/* Period picker */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Periode:</label>
          <PeriodPicker
            value={billingPeriod}
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
            placeholder="Cari pelanggan..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">Semua Status</option>
          <option value="UNPAID">Belum Lunas</option>
          <option value="PAID">Lunas</option>
          <option value="OVERDUE">Jatuh Tempo</option>
        </select>
        {packages.length > 0 && (
          <select
            value={packageFilter ?? ""}
            onChange={(e) => { setPackageFilter(e.target.value ? Number(e.target.value) : null); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Semua Paket</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {hasFilter && (
          <button
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPackageFilter(null); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            Reset
          </button>
        )}
        {filtered.length > 0 && (
          <button
            onClick={() => onBulkWA(filtered)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
          >
            <FiMessageSquare className="h-3.5 w-3.5" />
            WA Massal ({filtered.length})
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
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Periode</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Jatuh Tempo</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
            {loading && invoices.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-3 py-2 md:px-6 md:py-4">
                      <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" style={{ width: j === 0 ? 120 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length > 0 ? (
              paginated.map((inv, i) => (
                <tr key={inv.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm text-gray-500">{startIndex + i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-medium text-gray-900 dark:text-white/90">{inv.customer_name}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{formatRupiah(inv.amount_due)}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 font-mono text-xs text-gray-500 hidden md:table-cell">{inv.billing_period}</td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4 text-xs text-gray-500 hidden md:table-cell">
                    {new Date(inv.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status] ?? ""}`}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 md:px-6 md:py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(inv)}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                        title="Edit tagihan"
                      >
                        <FiEdit2 className="h-3 w-3" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      {inv.status !== "PAID" && (
                        <button
                          onClick={() => onSendWA(inv)}
                          className="inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                          title="Kirim WA tagihan"
                        >
                          <FiMessageSquare className="h-3 w-3" />
                          <span className="hidden sm:inline">WA</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <FiInbox className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {hasFilter ? "Tidak ada tagihan yang cocok" : "Belum ada tagihan"}
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

// ─── Bulk WA Modal ────────────────────────────────────────────────────────────

type BulkTemplateKey = "auto" | "H-3" | "H-1" | "H0" | "OVERDUE";

const TEMPLATE_OPTIONS: { value: BulkTemplateKey; label: string; desc: string }[] = [
  { value: "auto",    label: "Otomatis",           desc: "Template dipilih otomatis sesuai jatuh tempo tiap invoice" },
  { value: "H-3",     label: "H-3 (3 hari lagi)",  desc: "Pengingat 3 hari sebelum jatuh tempo" },
  { value: "H-1",     label: "H-1 (1 hari lagi)",  desc: "Pengingat 1 hari sebelum jatuh tempo" },
  { value: "H0",      label: "H0 (hari ini)",       desc: "Hari jatuh tempo" },
  { value: "OVERDUE", label: "Lewat Jatuh Tempo",   desc: "Tagihan sudah melewati jatuh tempo" },
];

function BulkWAModal({
  invoices,
  settings,
  onClose,
  onConfirm,
}: {
  invoices: Invoice[];
  settings: WASettings | null;
  onClose: () => void;
  onConfirm: (templateKey: BulkTemplateKey) => void;
}) {
  const [templateKey, setTemplateKey] = useState<BulkTemplateKey>("auto");
  const [sending, setSending] = useState(false);

  const unpaidCount = invoices.filter((i) => i.status !== "PAID").length;
  const previewInv = invoices.find((i) => i.status !== "PAID") ?? invoices[0];

  const previewMsg = previewInv
    ? templateKey === "auto"
      ? buildMessage(previewInv, settings)
      : renderTemplate(settings?.templates[templateKey] ?? `Halo {name}, tagihan periode {period} sebesar Rp{amount} jatuh tempo {due_date}.`, {
          name:     previewInv.customer_name,
          period:   previewInv.billing_period,
          amount:   previewInv.amount_due.toLocaleString("id-ID"),
          due_date: new Date(previewInv.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
        })
    : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

  const handleConfirm = async () => {
    setSending(true);
    try { onConfirm(templateKey); } finally { setSending(false); }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Kirim WA Massal</h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {unpaidCount} pelanggan belum lunas akan menerima pesan
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Pilih template */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Pilih Template Pesan
            </label>
            <div className="space-y-2">
              {TEMPLATE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    templateKey === opt.value
                      ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="templateKey"
                    value={opt.value}
                    checked={templateKey === opt.value}
                    onChange={() => setTemplateKey(opt.value)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{opt.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewInv && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                Preview pesan (contoh: {previewInv.customer_name})
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {previewMsg}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={sending}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            <FiMessageSquare className="h-4 w-4" />
            {sending ? "Memproses..." : `Kirim ke ${unpaidCount} Antrian`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Bulk Create Modal ────────────────────────────────────────────────────────

interface BulkItem {
  customer: Customer;
  router: MikrotikRouter;
  amount: number;
}

function BulkCreateModal({
  items,
  onClose,
  onConfirm,
}: {
  items: BulkItem[];
  onClose: () => void;
  onConfirm: (billingPeriod: string, dueDate: string, items: BulkItem[]) => Promise<void>;
}) {
  const [billingPeriod, setBillingPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [amount, setAmount] = useState(() => {
    // Default to first item's tariff amount if all are the same, else 0
    const first = items[0]?.amount ?? 0;
    return items.every((it) => it.amount === first) ? first : 0;
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const resolved = items.map((it) => ({ ...it, amount }));
      await onConfirm(billingPeriod, dueDate, resolved);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Buat Tagihan Massal</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{items.length} pelanggan dipilih</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Periode */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Periode Tagihan <span className="text-red-500">*</span>
            </label>
            <PeriodPicker
              value={billingPeriod}
              onChange={setBillingPeriod}
              inputClass="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700 focus:border-brand-500 focus:outline-none dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
            />
          </div>

          {/* Jatuh Tempo */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Jatuh Tempo <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Jumlah */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Jumlah Tagihan (Rp) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              placeholder="150000"
              value={amount || ""}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
            />
            <p className="mt-1 text-xs text-gray-400">Jumlah yang sama akan diterapkan ke semua {items.length} pelanggan</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <FiPlus className="h-4 w-4" />
            {submitting ? "Menyimpan..." : `Buat ${items.length} Tagihan`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TagihanComponent() {
  const { user } = useAuth();
  const mitraId = user?.role === "mitra"
    ? user.id
    : user?.role === "admin" || user?.role === "teknisi"
    ? user.parent_id ?? 0
    : 0;

  const [billingPeriod, setBillingPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const { invoices, loading, refresh, createInvoice, createBulkInvoices, updateInvoice } = useInvoices(billingPeriod);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [waSettings, setWaSettings] = useState<WASettings | null>(null);

  // Packages for filter
  const [packages, setPackages] = useState<Package[]>([]);
  useEffect(() => {
    PackageApi.getAll().then(setPackages).catch(() => setPackages([]));
  }, []);

  useEffect(() => {
    if (!mitraId) return;
    WhatsAppApi.getSettings(mitraId).then(setWaSettings).catch(() => {});
  }, [mitraId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refresh(); } finally { setTimeout(() => setIsRefreshing(false), 500); }
  };

  const handleUpdateInvoice = useCallback(async (id: number, data: UpdateInvoiceRequest) => {
    await updateInvoice(id, data);
  }, [updateInvoice]);

  // ── Bulk create ────────────────────────────────────────────────────────────
  const [showBulkPicker, setShowBulkPicker] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[] | null>(null);

  const handleSelectMultiple = useCallback(async (customers: Customer[], router: MikrotikRouter) => {
    // Fetch tariffs for all selected customers in parallel
    const tariffs = await Promise.all(
      customers.map((c) => FinanceApi.getTariff(c.id).catch(() => null))
    );
    const items: BulkItem[] = customers.map((c, i) => ({
      customer: c,
      router,
      amount: tariffs[i]?.monthly_fee ?? 0,
    }));
    setBulkItems(items);
    setShowBulkPicker(false);
  }, []);

  const handleBulkConfirm = useCallback(async (bp: string, dd: string, items: BulkItem[]) => {
    const result = await createBulkInvoices({
      billing_period: bp,
      due_date: new Date(dd).toISOString(),
      items: items.map((it) => ({
        customer_id: it.customer.id,
        customer_name: it.customer.name,
        amount_due: it.amount,
        router_id: it.router.id,
      })),
    });
    setBulkItems(null);
    if (result.skipped > 0 && result.created === 0) {
      SweetAlert.error("Semua Dilewati", `${result.skipped} tagihan sudah ada untuk periode ini`);
    } else if (result.skipped > 0) {
      SweetAlert.success("Selesai", `${result.created} dibuat, ${result.skipped} sudah ada`);
    } else {
      SweetAlert.success("Berhasil", `${result.created} tagihan berhasil dibuat`);
    }
  }, [createBulkInvoices]);

  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [showPicker, setShowPicker]     = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedRouter, setSelectedRouter]     = useState<MikrotikRouter | null>(null);

  const { tariff, upsert: upsertTariff } = useTariff(selectedCustomer?.id ?? null);
  const [editingTariff, setEditingTariff] = useState(false);
  const [tariffInput, setTariffInput]     = useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      billing_period: new Date().toISOString().slice(0, 7),
      due_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
    },
  });

  useEffect(() => {
    if (tariff && tariff.monthly_fee > 0) {
      setValue("amount_due", tariff.monthly_fee, { shouldValidate: false });
    }
  }, [tariff, setValue]);

  const handlePickCustomer = (customer: Customer, router: MikrotikRouter) => {
    setSelectedCustomer(customer);
    setSelectedRouter(router);
    setValue("customer_id", customer.id, { shouldValidate: true });
  };

  const openModal  = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    setSelectedRouter(null);
    setEditingTariff(false);
    reset({
      billing_period: new Date().toISOString().slice(0, 7),
      due_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
    });
  }, [reset]);

  const handleSaveTariff = async () => {
    if (!selectedCustomer) return;
    const fee = parseFloat(tariffInput);
    if (isNaN(fee) || fee < 0) return;
    await upsertTariff(selectedCustomer.id, fee);
    setValue("amount_due", fee, { shouldValidate: false });
    setEditingTariff(false);
  };

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      await createInvoice({
        ...data,
        customer_name: selectedCustomer?.name ?? "",
        router_id: selectedRouter?.id ?? undefined,
      });
      SweetAlert.success("Berhasil", "Tagihan berhasil dibuat");
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat membuat tagihan";
      SweetAlert.error("Gagal", msg);
    }
  };

  // ── WA Handlers ────────────────────────────────────────────────────────────

  const handleSendWA = useCallback(async (inv: Invoice) => {
    if (!mitraId) { SweetAlert.error("Tidak tersedia", "Sesi mitra tidak ditemukan."); return; }
    let waNumber = "";
    try {
      const customer = await CustomerApi.getById(inv.customer_id);
      waNumber = customer.wa_number ?? "";
    } catch {
      SweetAlert.error("Gagal", "Tidak dapat mengambil data pelanggan.");
      return;
    }
    if (!waNumber) {
      SweetAlert.error("Nomor WA tidak ada", `Pelanggan ${inv.customer_name} belum memiliki nomor WhatsApp.`);
      return;
    }
    const message = buildMessage(inv, waSettings);
    const result = await SweetAlert.fire({
      title: `Kirim WA ke ${inv.customer_name}`,
      html: `<div class="text-left text-sm space-y-2">
        <p class="text-gray-500">Nomor: <strong>${waNumber}</strong></p>
        <p class="text-gray-500 mt-2">Pesan:</p>
        <div class="rounded-lg bg-gray-50 p-3 text-gray-700 whitespace-pre-wrap border border-gray-200">${message}</div>
      </div>`,
      showCancelButton: true,
      confirmButtonText: "Kirim ke Antrian",
      cancelButtonText: "Batal",
    });
    if (!result.isConfirmed) return;
    try {
      await WhatsAppApi.enqueueManual({
        mitra_id:    mitraId,
        wa_number:   waNumber,
        message,
        customer_id: inv.customer_id,
        invoice_id:  inv.id,
      });
      SweetAlert.success("Berhasil", `Pesan untuk ${inv.customer_name} masuk ke antrian WA.`);
    } catch (err: any) {
      SweetAlert.error("Gagal", err.response?.data?.error || err.message);
    }
  }, [mitraId, waSettings]);

  const [bulkWAInvoices, setBulkWAInvoices] = useState<Invoice[] | null>(null);

  const handleBulkWA = useCallback((invs: Invoice[]) => {
    if (!mitraId) { SweetAlert.error("Tidak tersedia", "Sesi mitra tidak ditemukan."); return; }
    const unpaid = invs.filter((i) => i.status !== "PAID");
    if (unpaid.length === 0) {
      SweetAlert.error("Tidak ada tagihan", "Semua tagihan yang ditampilkan sudah lunas.");
      return;
    }
    setBulkWAInvoices(invs);
  }, [mitraId]);

  const handleBulkWAConfirm = useCallback(async (templateKey: BulkTemplateKey) => {
    if (!bulkWAInvoices || !mitraId) return;
    setBulkWAInvoices(null);

    const unpaid = bulkWAInvoices.filter((i) => i.status !== "PAID");
    const customers = await Promise.all(
      unpaid.map((inv) => CustomerApi.getById(inv.customer_id).catch(() => null))
    );

    let sent = 0;
    let skipped = 0;
    const enqueues: Promise<void>[] = [];

    unpaid.forEach((inv, i) => {
      const waNumber = customers[i]?.wa_number ?? "";
      if (!waNumber) { skipped++; return; }
      const message = templateKey === "auto"
        ? buildMessage(inv, waSettings)
        : renderTemplate(
            waSettings?.templates[templateKey] ??
              `Halo {name}, tagihan periode {period} sebesar Rp{amount} jatuh tempo {due_date}.`,
            {
              name:     inv.customer_name,
              period:   inv.billing_period,
              amount:   inv.amount_due.toLocaleString("id-ID"),
              due_date: new Date(inv.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
            }
          );
      enqueues.push(
        WhatsAppApi.enqueueManual({
          mitra_id:    mitraId,
          wa_number:   waNumber,
          message,
          customer_id: inv.customer_id,
          invoice_id:  inv.id,
        }).then(() => { sent++; }).catch(() => { skipped++; })
      );
    });

    await Promise.all(enqueues);

    if (skipped > 0 && sent === 0) {
      SweetAlert.error("Semua Dilewati", `${skipped} pelanggan tidak memiliki nomor WA atau gagal dikirim.`);
    } else if (skipped > 0) {
      SweetAlert.success("Selesai", `${sent} pesan masuk antrian. ${skipped} dilewati (nomor WA tidak ada).`);
    } else {
      SweetAlert.success("Berhasil", `${sent} pesan berhasil masuk ke antrian WA.`);
    }
  }, [bulkWAInvoices, mitraId, waSettings]);

  const totalOutstanding = useMemo(
    () => invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount_due, 0),
    [invoices]
  );

  return (
    <div className="space-y-6">
      {/* ── Summary Header ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Manajemen Tagihan
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-normal text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                    {billingPeriod}
                  </span>
                </h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {!loading && invoices.length > 0 && (
                  <>
                    <span className="text-orange-600 dark:text-orange-400">
                      Belum lunas: {formatRupiah(totalOutstanding)}
                    </span>
                    <span className="ml-2 text-gray-400">• {invoices.length} total tagihan</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowBulkPicker(true)}
                className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400 dark:hover:bg-brand-900/30"
              >
                <FiUsers className="h-4 w-4" />
                Tagihan Massal
              </button>
              <button
                onClick={openModal}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                <FiPlus className="h-4 w-4" />
                Buat Tagihan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Invoice Table ── */}
      <InvoiceTable
        invoices={invoices}
        loading={loading}
        billingPeriod={billingPeriod}
        onPeriodChange={setBillingPeriod}
        onEdit={setEditingInvoice}
        onSendWA={handleSendWA}
        onBulkWA={handleBulkWA}
        packages={packages}
      />

      {bulkWAInvoices && (
        <BulkWAModal
          invoices={bulkWAInvoices}
          settings={waSettings}
          onClose={() => setBulkWAInvoices(null)}
          onConfirm={handleBulkWAConfirm}
        />
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSave={handleUpdateInvoice}
        />
      )}

      {/* ── Create Modal ── */}
      {isModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="animate-modal-panel w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Buat Tagihan Baru</h3>
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
                  {errors.customer_id && <p className="mt-1 text-xs text-red-500">{errors.customer_id.message}</p>}
                </div>

                {/* Amount + tariff */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Jumlah Tagihan (Rp) <span className="text-red-500">*</span>
                    </label>
                    {selectedCustomer && (
                      <div className="flex items-center gap-2">
                        {tariff && tariff.monthly_fee > 0 && !editingTariff && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                            Tarif: {formatRupiah(tariff.monthly_fee)}
                          </span>
                        )}
                        {!editingTariff ? (
                          <button
                            type="button"
                            onClick={() => { setTariffInput(String(tariff?.monthly_fee ?? "")); setEditingTariff(true); }}
                            className="text-xs text-brand-500 underline hover:text-brand-600"
                          >
                            {tariff && tariff.monthly_fee > 0 ? "Edit tarif" : "Set tarif"}
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={tariffInput}
                              onChange={(e) => setTariffInput(e.target.value)}
                              className="w-24 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                            />
                            <button type="button" onClick={handleSaveTariff} className="text-xs font-medium text-green-600 hover:text-green-700">Simpan</button>
                            <button type="button" onClick={() => setEditingTariff(false)} className="text-xs text-gray-400 hover:text-gray-600">Batal</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    placeholder="150000"
                    {...register("amount_due", { valueAsNumber: true })}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                  />
                  {errors.amount_due && <p className="mt-1 text-xs text-red-500">{errors.amount_due.message}</p>}
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

                {/* Due date */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Jatuh Tempo <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="due_date"
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
                  {errors.due_date && <p className="mt-1 text-xs text-red-500">{errors.due_date.message}</p>}
                </div>
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
                  {isSubmitting ? "Menyimpan..." : "Buat Tagihan"}
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

      {showBulkPicker && (
        <CustomerPickerModal
          onSelect={() => {}}
          onSelectMultiple={handleSelectMultiple}
          onClose={() => setShowBulkPicker(false)}
        />
      )}

      {bulkItems && (
        <BulkCreateModal
          items={bulkItems}
          onClose={() => setBulkItems(null)}
          onConfirm={handleBulkConfirm}
        />
      )}
    </div>
  );
}
