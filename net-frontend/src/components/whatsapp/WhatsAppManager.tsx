"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiMessageSquare,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiSettings,
  FiSmartphone,
  FiTrash2,
  FiWifi,
  FiWifiOff,
} from "react-icons/fi";
import { WhatsAppApi, WASession, QueueItem, WASettings } from "@/lib/api/whatsapp";
import { SweetAlert } from "@/lib/sweetalert";
import { useAuth } from "@/context/AuthContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_COLORS: Record<string, string> = {
  "H-3":     "bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400",
  "H-1":     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "H0":      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "OVERDUE": "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
  "MANUAL":  "bg-gray-100   text-gray-600   dark:bg-gray-800      dark:text-gray-400",
};

const STATUS_DOT: Record<string, string> = {
  connected:    "bg-green-500",
  connecting:   "bg-yellow-400 animate-pulse",
  disconnected: "bg-gray-400",
  banned:       "bg-red-500",
};

// ── QR Modal ──────────────────────────────────────────────────────────────────

function QRModal({ mitraId, onClose }: { mitraId: number; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("connecting");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const s = await WhatsAppApi.getSessionStatus(mitraId);
    setStatus(s);
    if (s === "connected") {
      clearInterval(timerRef.current!);
      setTimeout(onClose, 1500);
      return;
    }
    const q = await WhatsAppApi.getQR(mitraId);
    setQr(q);
  }, [mitraId, onClose]);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, 3000);
    return () => clearInterval(timerRef.current!);
  }, [poll]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-center text-lg font-bold dark:text-white">Scan QR Code</h3>
        <p className="mb-4 text-center text-xs text-gray-500">Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>

        {status === "connected" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <FiCheckCircle className="h-16 w-16 text-green-500" />
            <p className="font-semibold text-green-600">Terhubung!</p>
          </div>
        ) : qr ? (
          <img src={qr} alt="WhatsApp QR Code" className="mx-auto h-64 w-64 rounded-xl" />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Memuat QR code…</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}

// ── Test Panel ────────────────────────────────────────────────────────────────

type TemplateKey = "H-3" | "H-1" | "H0" | "OVERDUE";

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function TestPanel({
  mitraId,
  settings,
  sessions,
}: {
  mitraId: number;
  settings: WASettings;
  sessions: WASession[];
}) {
  const [waNumber, setWaNumber]       = useState("");
  const [name, setName]               = useState("");
  const [dueDate, setDueDate]         = useState(() => new Date().toISOString().slice(0, 16));
  const [amount, setAmount]           = useState("150000");
  const [templateKey, setTemplateKey] = useState<TemplateKey | "custom">("H-3");
  const [customMsg, setCustomMsg]     = useState("");
  const [sending, setSending]         = useState(false);

  const vars = {
    name:     name || "Pelanggan",
    period:   new Date(dueDate).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    amount:   Number(amount).toLocaleString("id-ID"),
    due_date: new Date(dueDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
  };

  const preview =
    templateKey === "custom"
      ? renderTemplate(customMsg, vars)
      : renderTemplate(settings.templates[templateKey as TemplateKey] ?? "", vars);

  const connected = sessions.find((s) => s.mitra_id === mitraId && s.status === "connected");

  const handleSend = async () => {
    if (!waNumber.trim()) { SweetAlert.error("Nomor WA kosong", "Isi nomor tujuan terlebih dahulu."); return; }
    if (!preview.trim())  { SweetAlert.error("Pesan kosong", "Pilih template atau tulis pesan custom."); return; }
    if (!connected)       { SweetAlert.error("Tidak terhubung", "Sesi WhatsApp belum aktif."); return; }
    setSending(true);
    try {
      await WhatsAppApi.send({ mitra_id: mitraId, wa_number: waNumber, message: preview });
      SweetAlert.success("Terkirim", `Pesan test dikirim ke ${waNumber}`);
    } catch (err: any) {
      SweetAlert.error("Gagal", err.response?.data?.error || err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
      <h4 className="mb-5 flex items-center gap-2 font-bold dark:text-white">
        <FiSend className="text-brand-500" /> Test Pengiriman
      </h4>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kiri — input */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Nomor WA Tujuan</label>
            <input
              type="text"
              placeholder="08123456789"
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Nama Pelanggan</label>
              <input
                type="text"
                placeholder="Budi Santoso"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Nominal (Rp)</label>
              <input
                type="number" min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Tanggal &amp; Jam Jatuh Tempo</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Template</label>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as TemplateKey | "custom")}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
            >
              <option value="H-3">Reminder H-3</option>
              <option value="H-1">Reminder H-1</option>
              <option value="H0">Hari Jatuh Tempo (H0)</option>
              <option value="OVERDUE">Peringatan Terlambat</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {templateKey === "custom" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Pesan Custom</label>
              <textarea
                rows={3}
                placeholder="Tulis pesan... gunakan {name}, {period}, {amount}, {due_date}"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* Kanan — preview + kirim */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Preview Pesan</label>
            <div className="min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed whitespace-pre-wrap dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-200">
              {preview || <span className="text-gray-400 italic">Preview akan tampil di sini…</span>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/30">
            <p className="font-medium mb-1">Variabel yang digunakan:</p>
            <ul className="space-y-0.5">
              <li><code className="text-brand-500">{"{name}"}</code> → <span>{vars.name}</span></li>
              <li><code className="text-brand-500">{"{period}"}</code> → <span>{vars.period}</span></li>
              <li><code className="text-brand-500">{"{amount}"}</code> → <span>Rp{vars.amount}</span></li>
              <li><code className="text-brand-500">{"{due_date}"}</code> → <span>{vars.due_date}</span></li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !connected}
            className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? (
              <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Mengirim…</>
            ) : (
              <><FiSend /> Kirim Test</>
            )}
          </button>
          {!connected && (
            <p className="text-center text-xs text-red-400">Sesi WhatsApp belum terhubung</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WhatsAppManager() {
  const { user } = useAuth();
  // Resolve the correct mitra ID:
  // - mitra: their own ID
  // - admin/teknisi: their parent (mitra) ID
  // - superadmin: no own mitra, mitraId stays 0 (they see all sessions)
  const mitraId =
    user?.role === "mitra"
      ? user.id
      : user?.role === "admin" || user?.role === "teknisi"
      ? user.parent_id ?? 0
      : 0;

  const [activeTab, setActiveTab] = useState<"sessions" | "queue" | "settings">("sessions");
  const [sessions, setSessions]   = useState<WASession[]>([]);
  const [queue, setQueue]         = useState<QueueItem[]>([]);
  const [settings, setSettings]   = useState<WASettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [qrMitraId, setQrMitraId] = useState<number | null>(null);
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Data Loading ────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, q, st] = await Promise.all([
        WhatsAppApi.getSessions(),
        WhatsAppApi.getQueue({ mitra_id: mitraId || undefined, limit: 20 }),
        mitraId ? WhatsAppApi.getSettings(mitraId) : Promise.resolve(null),
      ]);
      setSessions(s);
      setQueue(q);
      if (st) setSettings(st);
    } catch (err: any) {
      console.error("Failed to load WA data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mitraId) return;
    loadData();
    const interval = setInterval(() => {
      if (activeTab === "queue") {
        WhatsAppApi.getQueue({ mitra_id: mitraId, limit: 20 }).then(setQueue).catch(() => {});
      }
      if (activeTab === "sessions") {
        WhatsAppApi.getSessions().then(setSessions).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mitraId]);

  // ── Session Handlers ────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    setConnectingId(mitraId);
    try {
      await WhatsAppApi.startSession(mitraId);
      setQrMitraId(mitraId);
      loadData();
    } catch (err: any) {
      SweetAlert.error("Gagal", err.response?.data?.error || err.message);
    } finally {
      setConnectingId(null);
    }
  };

  const handleShowQR = async (id: number) => {
    setQrMitraId(id);
  };

  const handleLogout = async (id: number) => {
    const ok = await SweetAlert.confirm("Logout Sesi?", "Sesi WhatsApp akan diputus.");
    if (!ok) return;
    try {
      await WhatsAppApi.logout(id);
      await loadData();
    } catch (err: any) {
      SweetAlert.error("Gagal", err.message);
    }
  };

  // ── Queue Handlers ──────────────────────────────────────────────────────────

  const handleRetry = async (id: number) => {
    try {
      await WhatsAppApi.retryItem(id);
      SweetAlert.success("Berhasil", "Pesan dijadwalkan ulang");
      const q = await WhatsAppApi.getQueue({ mitra_id: mitraId, limit: 20 });
      setQueue(q);
    } catch (err: any) {
      SweetAlert.error("Gagal", err.message);
    }
  };

  const handleTestSend = async () => {
    const mySession = sessions.find((s) => s.mitra_id === mitraId && s.status === "connected");
    if (!mySession) {
      SweetAlert.error("Tidak ada sesi aktif", "Hubungkan sesi WhatsApp terlebih dahulu.");
      return;
    }
    const result = await SweetAlert.fire({
      title: "Test Kirim",
      input: "text",
      inputLabel: "Masukkan nomor WA tujuan (contoh: 08123456789)",
      inputPlaceholder: "08123456789",
      showCancelButton: true,
      confirmButtonText: "Kirim",
    });
    const number = result.value as string | undefined;
    if (!number) return;
    try {
      await WhatsAppApi.send({ mitra_id: mitraId, wa_number: number, message: "Test pesan dari sistem." });
      SweetAlert.success("Berhasil", "Pesan test dikirim");
    } catch (err: any) {
      SweetAlert.error("Gagal", err.response?.data?.error || err.message);
    }
  };

  // ── Settings Handlers ───────────────────────────────────────────────────────

  const handleSaveSettings = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!settings || !mitraId) return;
    setSavingSettings(true);
    try {
      const updated = await WhatsAppApi.saveSettings(mitraId, {
        enabled:            settings.enabled,
        rate_limit_per_min: settings.rate_limit_per_min,
        base_delay_seconds: settings.base_delay_seconds,
        jitter_seconds:     settings.jitter_seconds,
        max_retry:          settings.max_retry,
        stop_on_fail_count: settings.stop_on_fail_count,
        templates:          settings.templates,
      });
      setSettings(updated);
      SweetAlert.success("Berhasil", "Pengaturan disimpan");
    } catch (err: any) {
      SweetAlert.error("Gagal", err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && sessions.length === 0 && !settings) return (
    <div className="space-y-6">
      {/* Skeleton tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-28 animate-pulse rounded-t-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      {/* Skeleton cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>
            <div className="h-px w-full bg-gray-100 dark:bg-gray-800" />
            <div className="mt-4 flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const mySession = sessions.find((s) => s.mitra_id === mitraId);

  return (
    <>
      {qrMitraId !== null && (
        <QRModal mitraId={qrMitraId} onClose={() => { setQrMitraId(null); loadData(); }} />
      )}

      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {[
            { id: "sessions", label: "Sesi WA",      icon: <FiSmartphone /> },
            { id: "queue",    label: "Antrian Pesan", icon: <FiMessageSquare /> },
            { id: "settings", label: "Konfigurasi",   icon: <FiSettings /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Sessions Tab ── */}
        {activeTab === "sessions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold dark:text-white/90">Sesi WhatsApp</h3>
              {!mySession && (
                <button
                  onClick={handleStartSession}
                  disabled={connectingId === mitraId}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {connectingId === mitraId ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Menghubungkan…</>
                  ) : (
                    <><FiPlus /> Hubungkan WhatsApp</>
                  )}
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center dark:border-gray-800">
                <FiSmartphone className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="mb-4 text-gray-500">Belum ada sesi WhatsApp. Hubungkan untuk mulai mengirim pesan.</p>
                <button
                  onClick={handleStartSession}
                  disabled={connectingId === mitraId}
                  className="mx-auto flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {connectingId === mitraId ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Menghubungkan…</>
                  ) : (
                    <><FiPlus /> Hubungkan WhatsApp</>
                  )}
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">
                          <FiSmartphone />
                        </div>
                        <div>
                          <p className="font-semibold dark:text-white">{s.session_name}</p>
                          <p className="text-xs text-gray-500">Mitra #{s.mitra_id}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleLogout(s.mitra_id)}
                        className="p-2 text-gray-400 hover:text-red-500"
                        title="Logout"
                      >
                        <FiTrash2 />
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s.status] ?? "bg-gray-400"}`} />
                        <span className="text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                          {s.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {s.status === "connecting" && (
                          <button
                            onClick={() => handleShowQR(s.mitra_id)}
                            className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-400"
                          >
                            Scan QR
                          </button>
                        )}
                        {s.status === "connected" && (
                          <span className="flex items-center gap-1 text-[10px] text-green-600">
                            <FiWifi className="h-3 w-3" /> Online
                          </span>
                        )}
                        {s.status === "disconnected" && (
                          <button
                            onClick={() => { handleStartSession(); }}
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-brand-500"
                          >
                            <FiWifiOff className="h-3 w-3" /> Reconnect
                          </button>
                        )}
                      </div>
                    </div>
                    {s.last_seen_at && (
                      <p className="mt-2 text-[10px] text-gray-400">
                        Last seen: {new Date(s.last_seen_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Queue Tab ── */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold dark:text-white/90">Antrian Pesan (20 Terakhir)</h3>
              <div className="flex gap-2">
                <button onClick={loadData} className="p-2 text-gray-500 hover:text-brand-500">
                  <FiRefreshCw />
                </button>
                <button
                  onClick={handleTestSend}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                >
                  <FiSend className="h-3.5 w-3.5" /> Test Kirim
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-6 py-3">Nomor WA</th>
                    <th className="px-6 py-3">Tipe</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Retry</th>
                    <th className="px-6 py-3">Waktu</th>
                    <th className="px-6 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">Antrian kosong</td>
                    </tr>
                  ) : queue.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-6 py-4">
                        <p className="font-medium dark:text-white">{q.wa_number}</p>
                        {q.customer_id && <p className="text-xs text-gray-500">Customer #{q.customer_id}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TRIGGER_COLORS[q.trigger_type] ?? "bg-gray-100 text-gray-600"}`}>
                          {q.trigger_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          q.status === "sent"     ? "bg-green-100  text-green-700"
                          : q.status === "failed" ? "bg-red-100    text-red-700"
                          : q.status === "skipped"? "bg-gray-100   text-gray-600"
                          : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {q.status === "sent"    ? <FiCheckCircle />
                           : q.status === "failed" ? <FiAlertCircle />
                           : <FiClock />}
                          {q.status}
                        </span>
                        {q.error_msg && <p className="mt-1 text-[10px] text-red-400">{q.error_msg}</p>}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{q.retry_count}</td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {q.sent_at
                          ? new Date(q.sent_at).toLocaleString()
                          : new Date(q.scheduled_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {q.status === "failed" && (
                          <button onClick={() => handleRetry(q.id)} className="text-brand-500 hover:text-brand-600">
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === "settings" && settings && (
          <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-8 rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* General Settings */}
              <div className="space-y-6">
                <div>
                  <h4 className="mb-4 flex items-center gap-2 font-bold dark:text-white">
                    <FiSettings className="text-brand-500" /> Pengaturan Umum
                  </h4>
                  <div className="space-y-4">
                    {/* Enable toggle */}
                    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-100 p-4 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/30">
                      <div>
                        <p className="text-sm font-semibold dark:text-white">Aktifkan Reminder</p>
                        <p className="text-xs text-gray-500">Kirim pesan otomatis kepada pelanggan</p>
                      </div>
                      <div className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-gray-200 transition dark:bg-gray-700">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={settings.enabled}
                          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                        />
                        <div className="after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500 peer-checked:after:translate-x-full peer-checked:after:border-white" />
                      </div>
                    </label>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Rate Limit (Pesan per Menit)</label>
                      <input
                        type="number" min={1} max={60}
                        value={settings.rate_limit_per_min}
                        onChange={(e) => setSettings({ ...settings, rate_limit_per_min: parseInt(e.target.value) || 1 })}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
                      />
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                        <FiAlertCircle /> Rekomendasi: 5 pesan/menit untuk keamanan nomor.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Jeda Antar Pesan (detik)</label>
                      <input
                        type="number" min={1}
                        value={settings.base_delay_seconds}
                        onChange={(e) => setSettings({ ...settings, base_delay_seconds: parseInt(e.target.value) || 1 })}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Jitter (detik)</label>
                        <input
                          type="number" min={0}
                          value={settings.jitter_seconds}
                          onChange={(e) => setSettings({ ...settings, jitter_seconds: parseInt(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Maks Retry</label>
                        <input
                          type="number" min={0}
                          value={settings.max_retry}
                          onChange={(e) => setSettings({ ...settings, max_retry: parseInt(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-50 bg-blue-50/30 p-4 dark:border-blue-900/20 dark:bg-blue-900/10">
                  <p className="mb-2 text-xs font-semibold text-blue-700 dark:text-blue-400">Variabel Template:</p>
                  <div className="flex flex-wrap gap-2">
                    {["{name}", "{period}", "{amount}", "{due_date}"].map((v) => (
                      <code key={v} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-blue-600 shadow-sm dark:bg-gray-800">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              </div>

              {/* Templates */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-bold dark:text-white">
                  <FiMessageSquare className="text-brand-500" /> Template Pesan
                </h4>
                <div className="space-y-4">
                  {([
                    { label: "Reminder H-3",          key: "H-3"    as const },
                    { label: "Reminder H-1",          key: "H-1"    as const },
                    { label: "Hari Jatuh Tempo (H0)", key: "H0"     as const },
                    { label: "Peringatan Terlambat",  key: "OVERDUE" as const },
                  ]).map((tmpl) => (
                    <div key={tmpl.key}>
                      <label className="mb-1 block text-xs font-medium text-gray-500">{tmpl.label}</label>
                      <textarea
                        rows={3}
                        value={settings.templates[tmpl.key]}
                        onChange={(e) => setSettings({
                          ...settings,
                          templates: { ...settings.templates, [tmpl.key]: e.target.value },
                        })}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-8 py-3 font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingSettings ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Menyimpan…</>
                ) : (
                  <><FiPlay className="h-4 w-4 fill-current" /> Simpan Konfigurasi</>
                )}
              </button>
            </div>
          </form>

          {/* ── Test Pengiriman ── */}
          <TestPanel mitraId={mitraId} settings={settings} sessions={sessions} />
          </div>
        )}
      </div>
    </>
  );
}
