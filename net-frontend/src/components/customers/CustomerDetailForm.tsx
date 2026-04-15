"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FiArrowLeft, FiSave, FiEdit2, FiCheckCircle, FiAlertCircle, FiCamera, FiX, FiLock, FiWifiOff, FiUnlock } from "react-icons/fi";
import { CustomerApi, Customer, UpdateCustomerRequest } from "@/lib/api/customer";
import { PelangganApi } from "@/lib/api/pelanggan";
import { FinanceApi, Invoice } from "@/lib/api/finance";
import { PackageApi } from "@/lib/api/packages";
import { PackagePicker } from "@/components/packages/PackagePicker";
import { SweetAlert } from "@/lib/sweetalert";
import { QuickPayModal } from "@/components/mikrotik/pelanggan/QuickPayModal";
import { MikrotikRouter } from "@/lib/api/mikrotik";

const LocationMap = dynamic(() => import("./LocationMap"), { ssr: false });

const TYPE_BADGE: Record<string, string> = {
  PPPOE:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DHCP:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface Props {
  id: number;
}

export function CustomerDetailForm({ id }: Props) {
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<"view" | "edit">("view");

  const [name, setName]         = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [address, setAddress]   = useState("");
  const [note, setNote]         = useState("");
  const [password, setPassword] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [showQuickPay, setShowQuickPay] = useState(false);

  // Invoices for view mode
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const c = await CustomerApi.getById(id);
      setCustomer(c);
      setName(c.name);
      setWaNumber(c.wa_number ?? "");
      setAddress(c.address ?? "");
      setNote(c.note ?? "");
      setSelectedPackageId(c.package_id ?? null);
      setLatitude(c.latitude ?? null);
      setLongitude(c.longitude ?? null);

      FinanceApi.getInvoices({ customer_id: id, period: currentPeriod })
        .then(setInvoices)
        .catch(() => setInvoices([]))
        .finally(() => setLoadingInvoices(false));
    } catch {
      SweetAlert.error("Gagal", "Pelanggan tidak ditemukan");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router, currentPeriod]);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);

  const isComplete = !!waNumber;

  const handleAssignPackage = async () => {
    if (!customer) return;
    setAssigningPkg(true);
    try {
      if (selectedPackageId) {
        await PackageApi.assign(selectedPackageId, customer.id);
      } else {
        await PackageApi.unassign(customer.id);
      }
      SweetAlert.success("Berhasil", "Paket berhasil diterapkan");
      setCustomer({ ...customer, package_id: selectedPackageId });
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setAssigningPkg(false);
    }
  };

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const req: UpdateCustomerRequest = {
        name,
        type: customer.type,
        email: "", 
        wa_number: waNumber,
        address,
        note,
        ...(password ? { password } : {}),
      };
      const updated = await CustomerApi.update(id, req);
      
      // Save coordinates if necessary
      let updatedWithCoords = updated;
      if (latitude !== customer.latitude || longitude !== customer.longitude) {
        updatedWithCoords = await CustomerApi.updateCoordinates(id, latitude, longitude);
      }

      setCustomer(updatedWithCoords);
      setPassword("");
      SweetAlert.success("Berhasil", "Profil pelanggan berhasil disimpan");
      setMode("view");
      
      // Clear querystring to remove "?mode=edit" cleanly
      router.replace(`/customers/${id}`);
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  };

  const executeMikrotikAction = async (action: "isolir" | "unisolir" | "block", actionName: string) => {
    if (!customer || !customer.router_id || !customer.mikrotik_ref) {
      SweetAlert.error("Gagal", "Pelanggan belum terhubung ke Mikrotik (Ref/Router ID kosong).");
      return;
    }

    const confirm = await SweetAlert.confirm(
      `Konfirmasi ${actionName}`,
      `Apakah Anda yakin ingin melakukan ${actionName} pada pelanggan ${customer.name}?`
    );
    if (!confirm.isConfirmed) return;

    setLoadingAction(true);
    try {
      // Fetch current mikrotik users to get the original_id
      const pList = await PelangganApi.findAll(customer.router_id);
      const p = pList.find(x => x.id === customer.mikrotik_ref);

      if (!p) {
        throw new Error("Data pengguna tidak ditemukan di router Mikrotik saat ini.");
      }

      if (action === "isolir") await PelangganApi.isolir(customer.router_id, customer.type, p.original_id);
      else if (action === "unisolir") await PelangganApi.unIsolir(customer.router_id, customer.type, p.original_id);
      else if (action === "block") await PelangganApi.block(customer.router_id, customer.type, p.original_id);

      // Force refresh on customer
      await loadCustomer();
      SweetAlert.success("Berhasil", `Aksi ${actionName} berhasil dieksekusi.`);
    } catch (err: unknown) {
      SweetAlert.error("Gagal", err instanceof Error ? err.message : "Terjadi kesalahan koneksi Mikrotik");
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading || !customer) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  const unpaidTotal = invoices
    .filter((inv) => inv.status !== "PAID")
    .reduce((s, inv) => s + inv.amount_due, 0);
  const unpaidCount = invoices.filter((inv) => inv.status !== "PAID").length;

  return (
    <div className="w-full space-y-6">
      {/* Header Bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <FiArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {mode === "edit" ? "Kelola Pelanggan" : "Detail Pelanggan"}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {customer.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "view" ? (
            <>
              {customer.router_id && customer.mikrotik_ref && (
                <>
                  <button
                    onClick={() => executeMikrotikAction(customer.is_active ? "isolir" : "unisolir", customer.is_active ? "Isolir" : "Buka Isolir")}
                    disabled={loadingAction}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-600 transition hover:bg-orange-100 disabled:opacity-60 dark:border-orange-900/50 dark:bg-orange-900/30 dark:text-orange-400"
                  >
                    {customer.is_active ? <FiLock className="h-4 w-4" /> : <FiUnlock className="h-4 w-4" />}
                    <span className="hidden sm:inline">{customer.is_active ? "Isolir" : "Buka Isolir"}</span>
                  </button>
                  <button
                    onClick={() => executeMikrotikAction("block", "Blokir")}
                    disabled={loadingAction}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-400"
                  >
                    <FiWifiOff className="h-4 w-4" />
                    <span className="hidden sm:inline">Blokir</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setShowQuickPay(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-60"
              >
                Bayar Tagihan
              </button>
              <button
                onClick={() => setMode("edit")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                <FiEdit2 className="h-4 w-4" /> <span className="hidden sm:inline">Edit Profil</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode("view");
                router.replace(`/customers/${id}`);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <FiX className="h-4 w-4" /> Batal
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        
        {/* Photo banner */}
        {(mode === "edit" || customer.photo_url) && (
          <label className={`relative block ${mode === 'edit' ? 'cursor-pointer' : ''}`}>
            <div className="h-32 w-full overflow-hidden bg-gray-100 dark:bg-gray-800 sm:h-48">
              {customer.photo_url ? (
                <img src={customer.photo_url} alt={customer.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-600">
                  <FiCamera className="h-8 w-8" />
                  <span className="text-sm">Klik untuk upload foto banner/pengguna</span>
                </div>
              )}
              {mode === "edit" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 text-white opacity-0 transition hover:bg-black/40 hover:opacity-100">
                  <FiCamera className="h-6 w-6" />
                  <span className="text-base font-medium">Ganti Foto</span>
                </div>
              )}
            </div>
            {mode === "edit" && (
              <input
                type="file"
                className="hidden"
                accept="image/jpeg,image/png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const url = await CustomerApi.uploadPhoto(customer.id, file);
                    setCustomer({ ...customer, photo_url: url });
                    SweetAlert.success("Berhasil", "Foto berhasil diunggah");
                  } catch (err: unknown) {
                    SweetAlert.error("Gagal", err instanceof Error ? err.message : "Terjadi kesalahan");
                  }
                }}
              />
            )}
          </label>
        )}

        <div className="p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between">
            <div className="flex items-center gap-4">
               {mode === "view" && !customer.photo_url && (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{customer.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[customer.type] ?? ""}`}>
                    {customer.type}
                  </span>
                  {customer.mikrotik_ref && (
                    <span className="font-mono text-xs text-gray-400">REF: {customer.mikrotik_ref}</span>
                  )}
                  {isComplete ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <FiCheckCircle className="h-3 w-3" /> Lengkap
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <FiAlertCircle className="h-3 w-3" /> Belum Lengkap
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Status Langganan</p>
              <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${customer.is_active ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
                <div className={`h-2 w-2 rounded-full ${customer.is_active ? "bg-green-500" : "bg-red-500"}`} />
                {customer.is_active ? "Aktif" : "Non-Aktif (Isolir/Blokir)"}
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Left Column: Basic Info & Package */}
            <div className="space-y-6">
              
              {mode === "edit" ? (
                <>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                    <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Paket Layanan</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <PackagePicker
                          routerId={customer.router_id ?? 0}
                          connectionType={customer.type}
                          value={selectedPackageId}
                          onChange={setSelectedPackageId}
                        />
                      </div>
                      <button
                        onClick={handleAssignPackage}
                        disabled={assigningPkg || selectedPackageId === customer.package_id}
                        className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                      >
                        {assigningPkg ? "..." : "Terapkan"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp</label>
                      <input type="text" value={waNumber} onChange={(e) => setWaNumber(e.target.value)}
                        placeholder="08123456789"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Pemasangan</label>
                      <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                        placeholder="Jl. Contoh No. 1"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ganti Password <span className="text-xs font-normal text-gray-400">(opsional)</span>
                      </label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Informasi Kontak</p>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                      <div className="grid grid-cols-2 gap-y-4">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">WhatsApp</p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{customer.wa_number || "Belum diisi"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Paket Layanan</p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">{customer.package_name || "Belum dipilih"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Alamat</p>
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white break-words">{customer.address || "Belum diisi"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                     <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Status Tagihan</p>
                     <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                      {loadingInvoices ? (
                        <div className="h-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                      ) : !customer.package_id ? (
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                            <FiAlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">Belum Lengkap</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Pelanggan belum memiliki paket layanan</p>
                          </div>
                        </div>
                      ) : unpaidCount > 0 ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Belum Lunas ({unpaidCount} Tagihan)</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total tunggakan Anda saat ini</p>
                          </div>
                          <span className="text-lg font-bold text-red-600 dark:text-red-400">{formatRupiah(unpaidTotal)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                            <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Lunas</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Tagihan periode {currentPeriod} aman</p>
                          </div>
                        </div>
                      )}
                     </div>
                  </div>
                </div>
              )}

              {/* Notes - always full width under fields in mobile or left col in desktop */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Catatan Internal</label>
                {mode === "edit" ? (
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                    placeholder="Opsional"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                ) : (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-800/30 dark:text-gray-300">
                    {customer.note || <span className="italic text-gray-400">Tidak ada catatan.</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Location Map */}
            <div className="flex flex-col h-full min-h-[300px]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Lokasi Pelanggan</p>
                {mode === "edit" && (
                  <span className="text-xs text-brand-600 dark:text-brand-400">Klik di peta untuk pin lokasi</span>
                )}
              </div>
              <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm relative z-0">
                <LocationMap
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  readOnly={mode === "view"}
                />
              </div>
              {(latitude || customer.latitude) && (
                <div className="mt-2 text-right text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {latitude ?? customer.latitude}, {longitude ?? customer.longitude}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Edit mode footer */}
        {mode === "edit" && (
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-800/50 sm:px-6">
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setMode("view");
                  router.replace(`/customers/${id}`);
                }}
                className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                <FiSave className="h-4 w-4" />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        )}

      </div>

      {showQuickPay && (
        <QuickPayModal
          customer={customer}
          router={{ id: customer.router_id ?? 0 } as MikrotikRouter}
          onClose={() => {
            setShowQuickPay(false);
            loadCustomer(); // Refresh invoices
          }}
        />
      )}
    </div>
  );
}
