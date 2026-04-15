"use client";

import { useState } from "react";
import { useFinanceSummary } from "@/lib/hooks/useFinance";
import {
  FiTrendingUp, FiFileText, FiCheckCircle, FiAlertCircle, FiRefreshCw,
} from "react-icons/fi";

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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="mt-3 h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-2 h-7 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LaporanKeuanganComponent() {
  const [period, setPeriod]   = useState(() => new Date().toISOString().slice(0, 7));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { summary, loading, error, refresh } = useFinanceSummary(period);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refresh(); } finally { setTimeout(() => setIsRefreshing(false), 500); }
  };

  return (
    <div className="space-y-6">
      {/* ── Header Card ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Laporan Keuangan</h2>
                {isRefreshing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <FiRefreshCw className="h-3 w-3 animate-spin" />
                    <span>Memperbarui...</span>
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Periode: <span className="font-medium text-gray-700 dark:text-gray-300">{period}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PeriodPicker
                value={period}
                onChange={setPeriod}
                inputClass="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
              <button
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Stat grid */}
        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Pemasukan"
            value={summary ? formatRupiah(summary.total_revenue) : "Rp 0"}
            sub={summary ? `${summary.payment_count} transaksi` : undefined}
            icon={<FiTrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
            color="bg-green-100 dark:bg-green-900/30"
            loading={loading}
          />
          <StatCard
            label="Total Tagihan"
            value={summary ? formatRupiah(summary.total_invoiced) : "Rp 0"}
            sub={summary ? `${summary.invoice_count} tagihan` : undefined}
            icon={<FiFileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
            color="bg-blue-100 dark:bg-blue-900/30"
            loading={loading}
          />
          <StatCard
            label="Sudah Lunas"
            value={summary ? formatRupiah(summary.total_paid) : "Rp 0"}
            icon={<FiCheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
            color="bg-green-100 dark:bg-green-900/30"
            loading={loading}
          />
          <StatCard
            label="Belum Lunas"
            value={summary ? formatRupiah(summary.total_outstanding) : "Rp 0"}
            icon={<FiAlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
            color="bg-orange-100 dark:bg-orange-900/30"
            loading={loading}
          />
        </div>

        {/* Summary row */}
        {!loading && summary && (
          <div className="flex flex-wrap gap-6 border-t border-gray-200 bg-gray-50/50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/40">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Jumlah Pembayaran</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.payment_count}</p>
            </div>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Jumlah Tagihan</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.invoice_count}</p>
            </div>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tingkat Pembayaran</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary.total_invoiced > 0
                  ? `${Math.round((summary.total_paid / summary.total_invoiced) * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
