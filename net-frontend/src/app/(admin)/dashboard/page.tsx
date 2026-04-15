"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { DashboardComponent } from "@/components/dashboard/DashboardComponent";
import { useAuth } from "@/context/AuthContext";
import MikrotikApi, { MikrotikRouter } from "@/lib/api/mikrotik";
import { FiFilter, FiServer, FiTag, FiWifi } from "react-icons/fi";
import { useTickets } from "@/lib/hooks/useTickets";
import { useFinanceSummary } from "@/lib/hooks/useFinance";
import { useONUDevices } from "@/lib/hooks/useONUDevices";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type StatusFilter = "all" | "active" | "inactive";
type SortOrder = "newest" | "oldest";

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const formatRupiahCompact = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

function SkeletonDonut() {
  return (
    <div className="flex flex-col items-center gap-3 py-2 animate-pulse">
      <div className="w-28 h-28 rounded-full border-[10px] border-gray-200 dark:border-gray-700" />
      <div className="w-full space-y-1.5">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
      </div>
    </div>
  );
}

const MONTHS = [
  { value: "01", label: "Jan" }, { value: "02", label: "Feb" },
  { value: "03", label: "Mar" }, { value: "04", label: "Apr" },
  { value: "05", label: "Mei" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Agu" },
  { value: "09", label: "Sep" }, { value: "10", label: "Okt" },
  { value: "11", label: "Nov" }, { value: "12", label: "Des" },
];

function ChartCard({
  title,
  icon,
  loading,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            {icon}
          </span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
        </div>
        {action && <div>{action}</div>}
      </div>
      {loading ? <SkeletonDonut /> : children}
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <span className="text-xs font-semibold text-gray-800 dark:text-white/90">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const { isAuthenticated } = useAuth();

  const [periodMonth, setPeriodMonth] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, "0")
  );
  const [periodYear, setPeriodYear] = useState(() =>
    String(new Date().getFullYear())
  );
  const period = `${periodYear}-${periodMonth}`;

  const handleMonthChange = useCallback((m: string) => {
    setPeriodMonth(m);
  }, []);

  const handleYearChange = useCallback((y: string) => {
    const num = parseInt(y, 10);
    if (!isNaN(num) && num >= 2020 && num <= 2099) {
      setPeriodYear(String(num));
    }
  }, []);

  const { tickets, loading: ticketsLoading } = useTickets();
  const { summary, loading: financeLoading } = useFinanceSummary(period);
  const { devices: onuDevices, loading: onuLoading } = useONUDevices();

  const filteredRouters = useMemo(() => {
    let result = [...routers];
    if (statusFilter === "active") {
      result = result.filter((r) => r.is_active);
    } else if (statusFilter === "inactive") {
      result = result.filter((r) => !r.is_active);
      result.sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
      });
    }
    return result;
  }, [routers, statusFilter, sortOrder]);

  // Router stats
  const activeRouters = routers.filter((r) => r.is_active).length;
  const inactiveRouters = routers.length - activeRouters;

  // Ticket stats per status
  const ticketByStatus = useMemo(() => ({
    open: tickets.filter((t) => t.status === "OPEN").length,
    assigned: tickets.filter((t) => t.status === "ASSIGNED").length,
    inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    resolved: tickets.filter((t) => t.status === "RESOLVED").length,
    closed: tickets.filter((t) => t.status === "CLOSED").length,
    overdue: tickets.filter((t) => t.is_overdue).length,
  }), [tickets]);

  // ONU stats
  const onuOnline = onuDevices.filter((d) => d.latest_status?.link_status === "up").length;
  const onuDown = onuDevices.filter((d) => d.latest_status?.link_status === "down").length;
  const onuDegraded = onuDevices.filter((d) => d.latest_status?.link_status === "degraded").length;
  const onuUnknown = onuDevices.length - onuOnline - onuDown - onuDegraded;

  // ── Chart Options ──────────────────────────────────────────────────────────

  const routerDonutOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif", toolbar: { show: false }, sparkline: { enabled: false } },
    colors: ["#10b981", "#f43f5e"],
    labels: ["Aktif", "Tidak Aktif"],
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              fontSize: "11px",
              color: "#6b7280",
              formatter: () => String(routers.length),
            },
            value: { fontSize: "16px", fontWeight: 600, color: "#111827", offsetY: 2 },
          },
        },
      },
    },
    tooltip: { enabled: true },
    states: { hover: { filter: { type: "lighten" } } },
  };

  const ticketDonutOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    colors: ["#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#6b7280"],
    labels: ["Open", "Assigned", "In Progress", "Resolved", "Closed"],
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              fontSize: "11px",
              color: "#6b7280",
              formatter: () => String(tickets.length),
            },
            value: { fontSize: "16px", fontWeight: 600, color: "#111827", offsetY: 2 },
          },
        },
      },
    },
    tooltip: { enabled: true },
  };

  const financeBarOptions: ApexOptions = {
    chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    colors: ["#3b82f6", "#10b981"],
    plotOptions: {
      bar: { horizontal: false, columnWidth: "50%", borderRadius: 4 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: ["Tagihan", "Lunas"],
      labels: { style: { fontSize: "11px", colors: ["#6b7280", "#6b7280"] } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (v) => formatRupiahCompact(v),
        style: { fontSize: "10px", colors: ["#9ca3af"] },
      },
    },
    grid: { borderColor: "#f3f4f6", strokeDashArray: 4, yaxis: { lines: { show: true } }, xaxis: { lines: { show: false } } },
    tooltip: {
      y: { formatter: (v) => formatRupiah(v) },
    },
    legend: { show: false },
  };

  const onuDonutOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    colors: ["#10b981", "#f43f5e", "#f59e0b", "#9ca3af"],
    labels: ["Online", "Down", "Degraded", "Unknown"],
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              fontSize: "11px",
              color: "#6b7280",
              formatter: () => String(onuDevices.length),
            },
            value: { fontSize: "16px", fontWeight: 600, color: "#111827", offsetY: 2 },
          },
        },
      },
    },
    tooltip: { enabled: true },
  };

  const fetchRouters = async () => {
    try {
      const data = await MikrotikApi.findAll();
      // Validasi data response
      if (!Array.isArray(data)) {
        console.warn("[Dashboard] Invalid response format from API:", data);
        setRouters([]);
        setError(null);
        return;
      }
      setRouters(data);
      setError(null);
    } catch (error) {
      // Tangani error JSON parse dari API
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.warn("[Dashboard] JSON parse error from API:", error.message);
        setRouters([]);
        setError(null);
        return;
      }
      setError(error instanceof Error ? error.message : "Failed to fetch routers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  // Guard: donut chart needs at least one non-zero value
  const routerHasData = routers.length > 0;
  const ticketHasData = tickets.length > 0;
  const onuHasData = onuDevices.length > 0;
  const financeHasData = summary && (summary.total_invoiced > 0 || summary.total_paid > 0);

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Ringkasan statistik sistem dan monitoring realtime perangkat MikroTik.
          </p>
        </div>
      </div>

      {/* Stats Charts */}
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">

        {/* MikroTik */}
        <ChartCard title="MikroTik" icon={<FiServer className="w-4 h-4" />} loading={loading}>
          {routerHasData ? (
            <>
              <ReactApexChart
                options={routerDonutOptions}
                series={[activeRouters, inactiveRouters]}
                type="donut"
                height={130}
              />
              <div className="mt-2 space-y-1.5">
                <LegendRow color="bg-emerald-500" label="Aktif" value={activeRouters} />
                <LegendRow color="bg-rose-500" label="Tidak Aktif" value={inactiveRouters} />
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-gray-400">Belum ada router</div>
          )}
        </ChartCard>

        {/* Tiket */}
        <ChartCard title="Tiket" icon={<FiTag className="w-4 h-4" />} loading={ticketsLoading}>
          {ticketHasData ? (
            <>
              <ReactApexChart
                options={ticketDonutOptions}
                series={[
                  ticketByStatus.open,
                  ticketByStatus.assigned,
                  ticketByStatus.inProgress,
                  ticketByStatus.resolved,
                  ticketByStatus.closed,
                ]}
                type="donut"
                height={130}
              />
              <div className="mt-2 space-y-1.5">
                <LegendRow color="bg-amber-400" label="Open" value={ticketByStatus.open} />
                <LegendRow color="bg-blue-500" label="Assigned" value={ticketByStatus.assigned} />
                <LegendRow color="bg-violet-500" label="In Progress" value={ticketByStatus.inProgress} />
                <LegendRow color="bg-emerald-500" label="Resolved" value={ticketByStatus.resolved} />
                {ticketByStatus.overdue > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-rose-500 font-medium">Overdue</span>
                    <span className="text-xs font-bold text-rose-500">{ticketByStatus.overdue}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-gray-400">Belum ada tiket</div>
          )}
        </ChartCard>

        {/* Keuangan */}
        <ChartCard
          title="Keuangan"
          icon={<span className="text-xs font-bold leading-none">Rp</span>}
          loading={financeLoading}
          action={
            <div className="flex items-center gap-1">
              <select
                value={periodMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-300 py-0.5 px-1 focus:outline-none"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={periodYear}
                onChange={(e) => handleYearChange(e.target.value)}
                min={2020}
                max={2099}
                className="text-xs w-14 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-300 py-0.5 px-1 focus:outline-none"
              />
            </div>
          }
        >
          {financeHasData ? (
            <>
              <ReactApexChart
                options={financeBarOptions}
                series={[
                  {
                    name: "Nominal",
                    data: [summary!.total_invoiced, summary!.total_paid],
                  },
                ]}
                type="bar"
                height={130}
              />
              <div className="mt-2 space-y-1.5">
                <LegendRow color="bg-blue-500" label="Total Tagihan" value={formatRupiahCompact(summary!.total_invoiced)} />
                <LegendRow color="bg-emerald-500" label="Lunas" value={formatRupiahCompact(summary!.total_paid)} />
                <LegendRow
                  color={summary!.total_outstanding > 0 ? "bg-rose-500" : "bg-gray-400"}
                  label="Belum Lunas"
                  value={formatRupiahCompact(summary!.total_outstanding)}
                />
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-gray-400">
              {summary ? "Belum ada transaksi bulan ini" : "Memuat data..."}
            </div>
          )}
        </ChartCard>

        {/* ONU */}
        <ChartCard title="ONU (GenieACS)" icon={<FiWifi className="w-4 h-4" />} loading={onuLoading}>
          {onuHasData ? (
            <>
              <ReactApexChart
                options={onuDonutOptions}
                series={[onuOnline, onuDown, onuDegraded, onuUnknown]}
                type="donut"
                height={130}
              />
              <div className="mt-2 space-y-1.5">
                <LegendRow color="bg-emerald-500" label="Online" value={onuOnline} />
                <LegendRow color="bg-rose-500" label="Down" value={onuDown} />
                {onuDegraded > 0 && <LegendRow color="bg-amber-400" label="Degraded" value={onuDegraded} />}
                {onuUnknown > 0 && <LegendRow color="bg-gray-400" label="Unknown" value={onuUnknown} />}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-gray-400">Belum ada data ONU</div>
          )}
        </ChartCard>

      </div>

      {/* Router Grid */}
      <div className="col-span-12">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Routers ({filteredRouters.length} / {routers.length})
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <FiFilter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-lg border border-gray-300 py-2 pl-10 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-36"
              >
                <option value="all">Semua</option>
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
              </select>
            </div>
            {statusFilter === "inactive" && (
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="rounded-lg border border-gray-300 py-2 pl-3 pr-6 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-36"
              >
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
              </select>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading routers...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/10">
            <h3 className="font-semibold text-error-800 dark:text-error-200">Failed to load routers</h3>
            <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p>
            {error.includes("401") && (
              <p className="mt-2 text-sm text-error-600 dark:text-error-400">Please login again to continue.</p>
            )}
          </div>
        ) : filteredRouters.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredRouters.map((router) => (
              <DashboardComponent
                key={router.id}
                routerId={router.id}
                routerName={router.name}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="text-center">
              <svg className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                {statusFilter !== "all" ? "Tidak ada router yang sesuai filter" : "No routers found"}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {statusFilter !== "all" ? "Coba ubah filter untuk melihat router lain" : "Add your first Mikrotik router to start monitoring."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
