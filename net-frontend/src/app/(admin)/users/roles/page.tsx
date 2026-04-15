import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peran & Hak Akses | Net Monitoring",
};

const ROLES = [
  {
    role: "superadmin",
    label: "Super Admin",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
    description: "Memiliki akses penuh ke seluruh sistem. Dapat mengelola semua pengguna, router, dan konfigurasi jaringan.",
    createdBy: "Dibuat oleh Super Admin lain",
  },
  {
    role: "mitra",
    label: "Mitra",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    description: "Mengelola tim Admin dan Teknisi di bawahnya. Dapat membuat akun dan mengelola router dalam lingkup mitra.",
    createdBy: "Dibuat oleh Super Admin",
  },
  {
    role: "admin",
    label: "Admin",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
    description: "Mengelola konfigurasi router dan memantau jaringan. Dapat melihat daftar pengguna namun tidak dapat melakukan perubahan.",
    createdBy: "Dibuat oleh Mitra",
  },
  {
    role: "teknisi",
    label: "Teknisi",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    description: "Akses terbatas untuk pemantauan dan pelaporan. Dapat melihat data monitoring jaringan secara real-time.",
    createdBy: "Dibuat oleh Mitra",
  },
];

const PERMISSIONS = [
  { action: "Lihat semua pengguna", superadmin: true, mitra: true, admin: true, teknisi: false },
  { action: "Buat pengguna baru", superadmin: true, mitra: true, admin: false, teknisi: false },
  { action: "Edit pengguna", superadmin: true, mitra: true, admin: false, teknisi: false },
  { action: "Hapus pengguna", superadmin: true, mitra: true, admin: false, teknisi: false },
  { action: "Kelola router Mikrotik", superadmin: true, mitra: true, admin: true, teknisi: false },
  { action: "Akses terminal router", superadmin: true, mitra: true, admin: true, teknisi: false },
  { action: "Lihat data monitoring", superadmin: true, mitra: true, admin: true, teknisi: true },
  { action: "Kelola PPPoE", superadmin: true, mitra: true, admin: true, teknisi: false },
  { action: "Kelola DHCP", superadmin: true, mitra: true, admin: true, teknisi: false },
];

function Check() {
  return (
    <span className="inline-flex items-center justify-center">
      <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

function Dash() {
  return (
    <span className="inline-flex items-center justify-center">
      <svg className="h-5 w-5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
      </svg>
    </span>
  );
}

export default function RolesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Peran &amp; Hak Akses
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Hierarki peran dan izin akses dalam sistem Net Monitoring
        </p>

        {/* Hierarchy diagram */}
        <div className="mt-6 flex flex-col items-center gap-0">
          <div className="rounded-lg border-2 border-purple-300 bg-purple-50 px-6 py-3 text-sm font-semibold text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
            Super Admin
          </div>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          <div className="rounded-lg border-2 border-blue-300 bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
            Mitra
          </div>
          <div className="flex items-start gap-12">
            <div className="flex flex-col items-center">
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div className="rounded-lg border-2 border-green-300 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400">
                Admin
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                Teknisi
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions table */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
          Tabel Izin Akses
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-3 text-left font-medium text-gray-500 dark:text-gray-400">Aksi</th>
                <th className="pb-3 text-center font-medium text-purple-600 dark:text-purple-400">Super Admin</th>
                <th className="pb-3 text-center font-medium text-blue-600 dark:text-blue-400">Mitra</th>
                <th className="pb-3 text-center font-medium text-green-600 dark:text-green-400">Admin</th>
                <th className="pb-3 text-center font-medium text-amber-600 dark:text-amber-400">Teknisi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {PERMISSIONS.map((p) => (
                <tr key={p.action} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3 text-gray-700 dark:text-gray-300">{p.action}</td>
                  <td className="py-3 text-center">{p.superadmin ? <Check /> : <Dash />}</td>
                  <td className="py-3 text-center">{p.mitra ? <Check /> : <Dash />}</td>
                  <td className="py-3 text-center">{p.admin ? <Check /> : <Dash />}</td>
                  <td className="py-3 text-center">{p.teknisi ? <Check /> : <Dash />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div
            key={r.role}
            className={`rounded-2xl border bg-white p-5 dark:bg-white/[0.03] ${r.border}`}
          >
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${r.color}`}>
              {r.label}
            </span>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{r.description}</p>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{r.createdBy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
