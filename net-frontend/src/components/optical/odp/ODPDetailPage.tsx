"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiChevronRight,
  FiEdit2,
  FiTrash2,
  FiRefreshCw,
  FiMapPin,
  FiServer,
  FiUser,
  FiGrid,
  FiArrowLeft,
  FiWifi,
  FiWifiOff,
  FiClock,
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiImage,
} from "react-icons/fi";
import { OpticalApi } from "@/lib/api/genieacs";
import { api } from "@/lib/axios";
import { SweetAlert } from "@/lib/sweetalert";
import type { ODPSummary, OpticalDevice, OpticalAlert, OpticalStatus } from "@/types/optical.types";
import type { MikrotikRouter } from "@/lib/api/mikrotik";
import type { User } from "@/lib/api/users";

// ─── Dynamic map (no SSR) ─────────────────────────────────────────────────────

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function fmtPower(v: number | null) {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)} dBm`;
}

function linkStatusColor(s?: string) {
  switch (s) {
    case "up": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "down": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "degraded": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    default: return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  }
}

function severityColor(s: string) {
  switch (s) {
    case "critical": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "warning": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    default: return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  }
}

// ─── Port bar ─────────────────────────────────────────────────────────────────

function PortBar({ used, total }: { used: number; total: number }) {
  const clampedUsed = Math.min(used, total);
  const pct = total > 0 ? Math.min(100, Math.round((clampedUsed / total) * 100)) : 0;
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
  const textColor =
    pct >= 90 ? "text-red-600 dark:text-red-400" : pct >= 70 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400";
  const available = Math.max(0, total - used);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">Port terpakai</span>
        <span className={`font-semibold ${textColor}`}>{used} / {total} ({pct}%)</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400">{available} port tersedia</p>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
        <span className="text-brand-500">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm border-b border-gray-50 last:border-0 dark:border-gray-800/60">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ODPDetailPageProps {
  odpId: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ODPDetailPage({ odpId }: ODPDetailPageProps) {
  const router = useRouter();

  const [odp, setOdp] = useState<ODPSummary | null>(null);
  const [onus, setOnus] = useState<OpticalDevice[]>([]);
  const [alerts, setAlerts] = useState<OpticalAlert[]>([]);
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [odpList, device, onuList, alertList, routerRes, userRes] = await Promise.all([
        OpticalApi.listODP(),
        OpticalApi.getODP(odpId),
        OpticalApi.listONU(),
        OpticalApi.listAlerts(),
        api.get<{ data: MikrotikRouter[] }>("/v1/mikrotik"),
        api.get<{ data: User[] }>("/v1/users/"),
      ]);
      const found = odpList.find((o) => o.id === odpId);
      if (!found) { setError("ODP tidak ditemukan"); return; }
      // Merge latest_status from the single-device endpoint (not present in list)
      setOdp({ ...found, latest_status: device?.latest_status ?? found.latest_status });
      setOnus(onuList.filter((o) => o.odp_id === odpId));
      setAlerts(alertList.filter((a) => a.device_id === odpId && !a.resolved_at));
      setRouters(routerRes.data.data ?? []);
      const allUsers: User[] = userRes.data.data ?? [];
      setTechnicians(allUsers.filter((u) => u.role === "teknisi" || u.role === "admin"));
    } catch {
      setError("Gagal memuat data ODP");
    } finally {
      setLoading(false);
    }
  }, [odpId]);

  useEffect(() => { load(); }, [load]);

  // Load Leaflet icon fix
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      setMapReady(true);
    });
  }, []);

  const handleDelete = async () => {
    if (!odp) return;
    const result = await SweetAlert.confirm(
      "Hapus ODP",
      `Apakah Anda yakin ingin menghapus ${odp.name}? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!result.isConfirmed) return;
    setIsDeleting(true);
    try {
      await OpticalApi.deleteODP(odpId);
      SweetAlert.success("Berhasil", "ODP berhasil dihapus");
      router.push("/optical/odp");
    } catch (err: any) {
      SweetAlert.error("Error", err?.response?.data?.message ?? "Gagal menghapus ODP");
      setIsDeleting(false);
    }
  };

  const routerName = odp?.mikrotik_id ? (routers.find((r) => r.id === odp.mikrotik_id)?.name ?? "—") : "—";
  const techName = odp?.technician_id ? (technicians.find((t) => t.id === odp.technician_id)?.name ?? "—") : "—";

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-6 w-64 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !odp) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <FiWifiOff className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500">{error ?? "ODP tidak ditemukan"}</p>
          <button
            onClick={load}
            className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = !odp.is_active
    ? { label: "Nonaktif", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", dot: "bg-gray-400" }
    : odp.fault_suspected
    ? { label: "Gangguan", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500 animate-pulse" }
    : { label: "Normal", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500 animate-pulse" };

  const latestStatus = odp.latest_status;

  return (
    <div className="flex h-full flex-col">
      {/* ── Breadcrumb & header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
          <Link href="/optical/odp" className="hover:text-brand-500">Jaringan Optik</Link>
          <FiChevronRight className="h-3 w-3" />
          <Link href="/optical/odp" className="hover:text-brand-500">ODP</Link>
          <FiChevronRight className="h-3 w-3" />
          <span className="text-gray-600 dark:text-gray-300">{odp.name}</span>
        </nav>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/optical/odp"
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <FiArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{odp.name}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                  {statusBadge.label}
                </span>
              </div>
              {odp.ip_address && (
                <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">{odp.ip_address}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <FiRefreshCw className="h-4 w-4" />
            </button>
            <Link
              href={`/optical/odp/${odpId}/edit`}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
            >
              <FiEdit2 className="h-4 w-4" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              <FiTrash2 className="h-4 w-4" />
              {isDeleting ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-3">

          {/* ── Left column (2/3) ── */}
          <div className="space-y-5 lg:col-span-2">

            {/* Active alerts */}
            {alerts.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <div className="mb-3 flex items-center gap-2">
                  <FiAlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                    {alerts.length} Alert Aktif
                  </p>
                </div>
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 dark:bg-gray-900">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{a.message}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{fmtDate(a.last_seen_at)}</p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${severityColor(a.severity)}`}>
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo */}
            {odp.photo_url && (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
                <a href={odp.photo_url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={odp.photo_url}
                    alt={odp.name}
                    className="h-56 w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                </a>
              </div>
            )}

            {/* Port capacity */}
            {odp.total_ports ? (
              <Section title="Kapasitas Port" icon={<FiGrid className="h-4 w-4" />}>
                <PortBar used={odp.used_ports ?? 0} total={odp.total_ports} />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{odp.total_ports}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Total Port</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                    <p className="text-xl font-bold text-brand-600 dark:text-brand-400">{odp.used_ports ?? 0}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Terpakai</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {Math.max(0, (odp.total_ports ?? 0) - (odp.used_ports ?? 0))}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">Tersedia</p>
                  </div>
                </div>
              </Section>
            ) : (
              <Section title="Kapasitas Port" icon={<FiGrid className="h-4 w-4" />}>
                <p className="text-sm text-gray-400">Port tidak dikonfigurasi</p>
              </Section>
            )}

            {/* Signal status */}
            <Section title="Status Sinyal" icon={<FiActivity className="h-4 w-4" />}>
              {latestStatus ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${linkStatusColor(latestStatus.link_status)}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {latestStatus.link_status}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(latestStatus.polled_at)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtPower(latestStatus.rx_power)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">RX Power</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtPower(latestStatus.tx_power)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">TX Power</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {latestStatus.attenuation !== null ? `${latestStatus.attenuation?.toFixed(2)} dB` : "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">Atenuasi</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Belum ada data sinyal</p>
              )}
            </Section>

            {/* ONU list */}
            <Section title={`ONU (${onus.length})`} icon={<FiWifi className="h-4 w-4" />}>
              {onus.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada ONU terdaftar di ODP ini</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {onus.map((onu) => {
                    const s = onu.latest_status;
                    const online = s?.link_status === "up";
                    return (
                      <div key={onu.id} className="flex items-center justify-between py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{onu.name}</p>
                          <p className="text-xs text-gray-400">
                            {onu.serial ? `SN: ${onu.serial}` : "—"}
                            {onu.ip_address ? ` · ${onu.ip_address}` : ""}
                          </p>
                        </div>
                        <div className="ml-3 flex items-center gap-2">
                          {s && (
                            <span className="text-xs text-gray-400">{fmtPower(s.rx_power)}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${online ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}>
                            {online ? <FiWifi className="h-3 w-3" /> : <FiWifiOff className="h-3 w-3" />}
                            {online ? "Up" : "Down"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* ── Right column (1/3) ── */}
          <div className="space-y-5">

            {/* Device info */}
            <Section title="Informasi Perangkat" icon={<FiServer className="h-4 w-4" />}>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                <InfoRow label="Serial" value={odp.serial || "—"} />
                <InfoRow label="IP Address" value={odp.ip_address || "—"} />
                <InfoRow label="GenieACS ID" value={odp.genieacs_id || "—"} />
                <InfoRow label="Vendor" value={odp.vendor || "—"} />
                <InfoRow
                  label="Status"
                  value={
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                      {statusBadge.label}
                    </span>
                  }
                />
                <InfoRow label="Dibuat" value={fmtDate(odp.created_at)} />
                <InfoRow label="Diperbarui" value={fmtDate(odp.updated_at)} />
              </div>
            </Section>

            {/* Assignment */}
            <Section title="Penugasan" icon={<FiUser className="h-4 w-4" />}>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                <InfoRow label="Router" value={routerName} />
                <InfoRow label="Teknisi" value={techName} />
              </div>
            </Section>

            {/* ONU summary */}
            <Section title="Ringkasan ONU" icon={<FiGrid className="h-4 w-4" />}>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                <InfoRow label="Total ONU" value={odp.total_onus} />
                <InfoRow
                  label="ONU Down"
                  value={
                    odp.down_onus > 0
                      ? <span className="font-semibold text-red-600 dark:text-red-400">{odp.down_onus}</span>
                      : <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><FiCheckCircle className="h-3.5 w-3.5" />0</span>
                  }
                />
                <InfoRow label="ONU Degraded" value={odp.degraded_onus > 0 ? <span className="font-semibold text-yellow-600">{odp.degraded_onus}</span> : "0"} />
              </div>
            </Section>

            {/* Location map */}
            {odp.latitude && odp.longitude ? (
              <Section title="Lokasi" icon={<FiMapPin className="h-4 w-4" />}>
                <div className="space-y-3">
                  <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {odp.latitude.toFixed(6)}, {odp.longitude.toFixed(6)}
                  </p>
                  <div className="h-48 overflow-hidden rounded-xl">
                    {mapReady && (
                      <MapContainer
                        center={[odp.latitude, odp.longitude]}
                        zoom={15}
                        style={{ height: "100%", width: "100%" }}
                        zoomControl={false}
                        scrollWheelZoom={false}
                        dragging={false}
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[odp.latitude, odp.longitude]}>
                          <Popup>{odp.name}</Popup>
                        </Marker>
                      </MapContainer>
                    )}
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${odp.latitude},${odp.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                  >
                    <FiMapPin className="h-4 w-4" />
                    Buka di Google Maps
                  </a>
                </div>
              </Section>
            ) : (
              <Section title="Lokasi" icon={<FiMapPin className="h-4 w-4" />}>
                <p className="text-sm text-gray-400">Lokasi belum dikonfigurasi</p>
              </Section>
            )}

            {/* Photo placeholder if no photo */}
            {!odp.photo_url && (
              <Section title="Foto" icon={<FiImage className="h-4 w-4" />}>
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-gray-50 py-8 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
                  <FiImage className="h-10 w-10" />
                  <p className="text-xs">Belum ada foto</p>
                </div>
                <Link
                  href={`/optical/odp/${odpId}/edit`}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                >
                  Upload foto
                </Link>
              </Section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
