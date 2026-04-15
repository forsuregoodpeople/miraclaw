"use client";

import React, { useState } from "react";
import { FiServer, FiRadio, FiMessageSquare, FiAlertCircle, FiChevronDown, FiChevronUp } from "react-icons/fi";

type Step = {
  text: string;
  code?: string;
};

type GuideSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  tags: string[];
  steps: Step[];
};

const GUIDES: GuideSection[] = [
  {
    id: "mikrotik",
    title: "Setup MikroTik",
    icon: <FiServer className="w-5 h-5" />,
    color: "blue",
    tags: ["RouterOS", "PPPoE", "DHCP"],
    steps: [
      { text: "Pastikan MikroTik sudah terkoneksi ke jaringan dan dapat diakses via IP." },
      { text: "Buka menu Perangkat → tambah router baru dengan isi IP, username, dan password API MikroTik." },
      { text: "Aktifkan API MikroTik di router: masuk ke IP → Services → aktifkan port 8728 (API) atau 8729 (API-SSL).", code: "/ip service enable api" },
      { text: "Tambahkan user dengan group full atau policy api, read, write di MikroTik.", code: "/user add name=monitoring group=full password=rahasia" },
      { text: "Setelah router ditambahkan, dashboard akan menampilkan CPU, Memory, dan Disk secara realtime." },
      { text: "Untuk PPPoE: tambahkan Secret pelanggan melalui menu Pelanggan → Pelanggan, isi username/password PPPoE dan paket." },
    ],
  },
  {
    id: "genieacs",
    title: "Setup GenieACS (ONU/ONT)",
    icon: <FiRadio className="w-5 h-5" />,
    color: "emerald",
    tags: ["TR-069", "ACS", "ONU", "ONT"],
    steps: [
      { text: "Pastikan GenieACS sudah berjalan dan dapat diakses (default port 7547 untuk cwmp, 7557 untuk NBI)." },
      { text: "Isi konfigurasi GenieACS di Pengaturan: masukkan URL NBI GenieACS beserta username/password." },
      { text: "Di ONU/ONT, aktifkan TR-069 dan arahkan ACS URL ke server GenieACS.", code: "ACS URL: http://<ip-server>:7547" },
      { text: "Set username dan password CWMP di ONU agar sesuai dengan konfigurasi GenieACS." },
      { text: "ONU akan muncul otomatis di menu Jaringan Optik → GenieACS setelah berhasil koneksi ke ACS." },
      { text: "Gunakan menu ODP untuk memetakan ONU ke lokasi ODP di peta jaringan." },
    ],
  },
  {
    id: "whatsapp",
    title: "Setup WhatsApp Bot",
    icon: <FiMessageSquare className="w-5 h-5" />,
    color: "amber",
    tags: ["WhatsApp", "Notifikasi", "Bot"],
    steps: [
      { text: "Masuk ke menu Pengaturan → WhatsApp (hanya tersedia untuk role Mitra)." },
      { text: "Scan QR Code menggunakan WhatsApp yang akan digunakan sebagai bot pengirim notifikasi." },
      { text: "Setelah terhubung, bot akan otomatis mengirim notifikasi tagihan, pembayaran, dan tiket ke pelanggan." },
      { text: "Pastikan nomor WhatsApp pelanggan sudah diisi dengan format internasional tanpa tanda '+'.", code: "Contoh: 628123456789" },
      { text: "Jika sesi terputus, ulangi proses scan QR Code di menu yang sama." },
    ],
  },
  {
    id: "troubleshooting",
    title: "Tips & Troubleshooting",
    icon: <FiAlertCircle className="w-5 h-5" />,
    color: "rose",
    tags: ["Debug", "Error", "Tips"],
    steps: [
      { text: "Router tidak muncul data: pastikan API MikroTik aktif dan firewall tidak memblokir port 8728." },
      { text: "WebSocket disconnect: cek koneksi internet dan pastikan backend berjalan di port 3003." },
      { text: "ONU tidak muncul di GenieACS: periksa ACS URL di ONU dan pastikan port 7547 dapat diakses dari ONU." },
      { text: "Login gagal terus: cek JWT_SECRET di konfigurasi backend, harus minimal 64 karakter." },
      { text: "Data PPPoE tidak muncul: pastikan user MikroTik memiliki policy 'api' dan 'read'.", code: "/user group print" },
      { text: "Untuk debug backend, periksa log dengan:", code: "go run ./cmd/net/ 2>&1 | tail -f" },
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
  blue:    { bg: "bg-blue-50 dark:bg-blue-900/10",    border: "border-blue-200 dark:border-blue-800",    icon: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",    badge: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-900/10", border: "border-emerald-200 dark:border-emerald-800", icon: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
  amber:   { bg: "bg-amber-50 dark:bg-amber-900/10",   border: "border-amber-200 dark:border-amber-800",   icon: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",   badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-900/10",     border: "border-rose-200 dark:border-rose-800",     icon: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",     badge: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300" },
};

function GuideCard({ guide }: { guide: GuideSection }) {
  const [open, setOpen] = useState(true);
  const c = colorMap[guide.color];

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`flex items-center justify-center w-9 h-9 rounded-lg ${c.icon}`}>
            {guide.icon}
          </span>
          <div>
            <p className="font-semibold text-gray-800 dark:text-white/90">{guide.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {guide.tags.map((tag) => (
                <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <span className="text-gray-400 dark:text-gray-500 ml-4 shrink-0">
          {open ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{step.text}</p>
                  {step.code && (
                    <code className="mt-1.5 block text-xs bg-gray-900 dark:bg-black text-emerald-400 px-3 py-2 rounded-md font-mono overflow-x-auto">
                      {step.code}
                    </code>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PanduanPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panduan Setup Cepat</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Langkah-langkah ringkas untuk mengkonfigurasi MikroTik, GenieACS, WhatsApp Bot, dan troubleshooting umum.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GUIDES.map((guide) => (
          <GuideCard key={guide.id} guide={guide} />
        ))}
      </div>
    </div>
  );
}
