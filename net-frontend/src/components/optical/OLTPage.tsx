"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCw, FiX, FiWifiOff, FiMapPin } from "react-icons/fi";
import { OpticalApi } from "@/lib/api/genieacs";
import { oltSchema, OLTFormData } from "@/lib/schema";
import { SweetAlert } from "@/lib/sweetalert";
import type { OpticalDevice } from "@/types/optical.types";

const LocationPicker = dynamic(
  () => import("@/components/ui/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-[280px] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" /> }
);

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />Aktif
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Nonaktif
    </span>
  );
}

interface ModalProps {
  olt: OpticalDevice | null;
  onClose: () => void;
  onSave: () => void;
}

function OLTModal({ olt, onClose, onSave }: ModalProps) {
  const isEdit = olt !== null;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickedLat, setPickedLat] = useState<number | undefined>(olt?.latitude ?? undefined);
  const [pickedLng, setPickedLng] = useState<number | undefined>(olt?.longitude ?? undefined);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<OLTFormData>({
    resolver: zodResolver(oltSchema) as any,
    defaultValues: isEdit ? {
      name: olt.name, serial: olt.serial ?? "", ip_address: olt.ip_address ?? "",
      latitude: olt.latitude, longitude: olt.longitude,
      vendor: olt.vendor as OLTFormData["vendor"], is_active: olt.is_active,
    } : { is_active: true },
  });

  const handleLocationChange = (lat: number, lng: number) => {
    setPickedLat(lat); setPickedLng(lng);
    setValue("latitude", lat); setValue("longitude", lng);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "unset"; };
  }, [onClose]);

  const onSubmit = async (data: OLTFormData) => {
    setSaving(true); setErr(null);
    try {
      const payload = { ...data, latitude: data.latitude || undefined, longitude: data.longitude || undefined };
      if (isEdit) await OpticalApi.updateOLT(olt.id, payload);
      else await OpticalApi.createOLT(payload);
      SweetAlert.success("Berhasil", `OLT berhasil ${isEdit ? "diperbarui" : "ditambahkan"}`);
      onSave();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? "Gagal menyimpan";
      setErr(msg); SweetAlert.error("Error", msg);
    } finally { setSaving(false); }
  };

  const inputCls = (hasErr?: boolean) =>
    `w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${hasErr
      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
      : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? "Edit OLT" : "Tambah OLT"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"><FiX className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="max-h-[75vh] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Nama OLT <span className="text-red-500">*</span></label>
              <input {...register("name")} placeholder="OLT-JKT-01" className={inputCls(!!errors.name)} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Vendor</label>
              <select {...register("vendor")} className={`bg-white ${inputCls()}`}>
                <option value="">— Pilih vendor —</option>
                {["zte", "huawei", "fiberhome"].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">IP Address</label>
              <input {...register("ip_address")} placeholder="192.168.x.x" className={inputCls()} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Serial</label>
              <input {...register("serial")} className={inputCls()} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Lokasi <span className="text-xs font-normal text-gray-400">(klik pada peta untuk menentukan titik)</span>
              </label>
              <LocationPicker latitude={pickedLat} longitude={pickedLng} onLocationChange={handleLocationChange} height="280px" />
              {pickedLat && pickedLng && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <FiMapPin className="h-3 w-3 text-brand-500" />
                  {pickedLat.toFixed(6)}, {pickedLng.toFixed(6)}
                  <button type="button" onClick={() => { setPickedLat(undefined); setPickedLng(undefined); setValue("latitude", undefined); setValue("longitude", undefined); }} className="ml-1 text-red-400 hover:text-red-600">(hapus)</button>
                </p>
              )}
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input {...register("is_active")} type="checkbox" id="olt-active" className="h-4 w-4 rounded border-gray-300 text-brand-500" />
              <label htmlFor="olt-active" className="text-sm text-gray-700 dark:text-gray-300">Aktif</label>
            </div>
          </div>
          {err && <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">{err}</div>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Batal</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OLTPage() {
  const [olts, setOlts] = useState<OpticalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<OpticalDevice | null | false>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOlts(await OpticalApi.listOLT()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    const res = await SweetAlert.confirm("Hapus OLT", "OLT ini akan dihapus secara permanen.");
    if (!res.isConfirmed) return;
    setDeletingId(id);
    try { await OpticalApi.deleteOLT(id); setOlts(p => p.filter(o => o.id !== id)); SweetAlert.success("Berhasil", "OLT dihapus"); }
    catch (e: any) { SweetAlert.error("Error", e?.response?.data?.message ?? "Gagal menghapus"); }
    finally { setDeletingId(null); }
  };

  const filtered = olts.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.ip_address ?? "").includes(search)
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Manajemen OLT</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total {olts.length} Optical Line Terminal</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <FiRefreshCw className="h-4 w-4" />Refresh
          </button>
          <button onClick={() => setModal(null)} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            <FiPlus className="h-4 w-4" />Tambah OLT
          </button>
        </div>
      </div>

      <input type="text" placeholder="Cari nama atau IP..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {["Nama OLT", "Vendor", "IP Address", "Serial", "Status", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">Memuat...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <FiWifiOff className="h-8 w-8" />
                    <span className="text-sm">Belum ada data OLT</span>
                  </div>
                </td>
              </tr>
            ) : filtered.map(olt => (
              <tr key={olt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{olt.name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{olt.vendor || "—"}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{olt.ip_address || "—"}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{olt.serial || "—"}</td>
                <td className="px-4 py-3"><StatusBadge active={olt.is_active} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setModal(olt)} className="text-gray-400 hover:text-brand-500"><FiEdit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(olt.id)} disabled={deletingId === olt.id} className="text-gray-400 hover:text-red-500 disabled:opacity-40"><FiTrash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== false && (
        <OLTModal olt={modal} onClose={() => setModal(false)} onSave={() => { setModal(false); load(); }} />
      )}
    </div>
  );
}
