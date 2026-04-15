"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import {
  FiChevronRight,
  FiMapPin,
  FiX,
  FiUpload,
  FiImage,
  FiLayers,
  FiSave,
  FiArrowLeft,
  FiCpu,
} from "react-icons/fi";
import { GenieACSPickerModal } from "./GenieACSPickerModal";
import { OpticalApi } from "@/lib/api/genieacs";
import { api } from "@/lib/axios";
import { odpSchema, ODPFormData } from "@/lib/schema";
import { SweetAlert } from "@/lib/sweetalert";
import { calculateDistance } from "@/lib/map/map-utils";
import type { ODPSummary } from "@/types/optical.types";
import type { MikrotikRouter } from "@/lib/api/mikrotik";
import type { User } from "@/lib/api/users";
import type * as Leaflet from "leaflet";

// ─── Map layers (same as MapDevice.tsx) ──────────────────────────────────────

const MAP_LAYERS = {
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  street: {
    name: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  terrain: {
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com">CARTO</a>',
  },
} as const;

type LayerKey = keyof typeof MAP_LAYERS;

const DEFAULT_CENTER: [number, number] = [-7.5463, 112.2364];

// ─── Dynamic react-leaflet imports (no SSR) ───────────────────────────────────

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

// ─── Inner map handlers (must be used inside MapContainer) ───────────────────

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  const { useMapEvents } = require("react-leaflet");
  useMapEvents({
    click: (e: any) => onMapClick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const { useMap } = require("react-leaflet");
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ODPFormPageProps {
  mode: "create" | "edit";
  odpId?: number; // edit only
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ODPFormPage({ mode, odpId }: ODPFormPageProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  // Leaflet instance
  const [L, setL] = useState<typeof Leaflet | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<LayerKey>("street");

  // Location state (drives map marker and form values)
  const [pickedLat, setPickedLat] = useState<number | undefined>();
  const [pickedLng, setPickedLng] = useState<number | undefined>();

  // Photo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Remote data
  const [routers, setRouters] = useState<MikrotikRouter[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  // GenieACS picker
  const [pickerOpen, setPickerOpen] = useState(false);

  // ODP name for live marker label
  const [odpName, setOdpName] = useState("");

  // Nearest router info (from calculateDistance)
  const [nearestRouter, setNearestRouter] = useState<{ name: string; distanceM: number } | null>(null);

  // ── Form ──────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ODPFormData>({
    resolver: zodResolver(odpSchema) as any,
    defaultValues: { is_active: true },
  });

  const watchedName = watch("name");
  useEffect(() => { setOdpName(watchedName ?? ""); }, [watchedName]);

  // ── Load Leaflet ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((leaflet) => {
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      setL(leaflet);
      setMapReady(true);
    });
  }, []);

  // ── Load routers + technicians (and existing ODP for edit) ───────────────

  useEffect(() => {
    (async () => {
      setLoadingData(true);
      try {
        const [routerRes, userRes] = await Promise.all([
          api.get<{ data: MikrotikRouter[] }>("/v1/mikrotik"),
          api.get<{ data: User[] }>("/v1/users/"),
        ]);
        const allRouters: MikrotikRouter[] = routerRes.data.data ?? [];
        const allUsers: User[] = userRes.data.data ?? [];
        setRouters(allRouters);
        setTechnicians(allUsers.filter((u) => u.role === "teknisi" || u.role === "admin"));

        if (isEdit && odpId) {
          const odps = await OpticalApi.listODP();
          const found = odps.find((o) => o.id === odpId);
          if (found) {
            setValue("name", found.name);
            setValue("serial", found.serial ?? "");
            setValue("ip_address", found.ip_address ?? "");
            if (found.total_ports) setValue("total_ports", found.total_ports);
            if (found.used_ports != null) setValue("used_ports", found.used_ports);
            if (found.mikrotik_id) setValue("mikrotik_id", found.mikrotik_id);
            if (found.technician_id) setValue("technician_id", found.technician_id);
            setValue("is_active", found.is_active);
            if (found.latitude) { setPickedLat(found.latitude); setValue("latitude", found.latitude); }
            if (found.longitude) { setPickedLng(found.longitude); setValue("longitude", found.longitude); }
            if (found.photo_url) setPhotoPreview(found.photo_url);
            setOdpName(found.name);

            // Calculate nearest router distance
            if (found.latitude && found.longitude) {
              updateNearestRouter(found.latitude, found.longitude, allRouters);
            }
          }
        }
      } catch {
        SweetAlert.error("Error", "Gagal memuat data");
      } finally {
        setLoadingData(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, odpId]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const updateNearestRouter = useCallback(
    (lat: number, lng: number, routerList: MikrotikRouter[]) => {
      let nearest: MikrotikRouter | null = null;
      let minDist = Infinity;
      routerList.forEach((r) => {
        if (!r.latitude || !r.longitude) return;
        const d = calculateDistance(lat, lng, r.latitude, r.longitude);
        if (d < minDist) { minDist = d; nearest = r; }
      });
      setNearestRouter(nearest ? { name: (nearest as MikrotikRouter).name, distanceM: Math.round(minDist) } : null);
    },
    []
  );

  const handleLocationChange = useCallback(
    (lat: number, lng: number) => {
      setPickedLat(lat);
      setPickedLng(lng);
      setValue("latitude", lat);
      setValue("longitude", lng);
      updateNearestRouter(lat, lng, routers);
    },
    [routers, setValue, updateNearestRouter]
  );

  const clearLocation = () => {
    setPickedLat(undefined);
    setPickedLng(undefined);
    setValue("latitude", undefined);
    setValue("longitude", undefined);
    setNearestRouter(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > 5 * 1024 * 1024) { setUploadError("Maks. 5 MB"); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      setUploadError("Format: JPG, PNG, atau WebP");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // ── Custom ODP marker icon ────────────────────────────────────────────────

  const odpMarkerIcon = L?.divIcon({
    html: `
      <div style="
        background-color: #6366f1;
        width: 36px; height: 36px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 13px; font-weight: bold; cursor: pointer;
      ">O</div>
    `,
    className: "custom-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (data: ODPFormData) => {
    setIsSaving(true);
    try {
      const payload = {
        ...data,
        latitude: pickedLat,
        longitude: pickedLng,
        total_ports: data.total_ports || undefined,
        used_ports: data.used_ports ?? 0,
        mikrotik_id: data.mikrotik_id || undefined,
        technician_id: data.technician_id || undefined,
      };

      let savedId: number;
      if (isEdit && odpId) {
        const updated = await OpticalApi.updateODP(odpId, payload);
        savedId = updated.id;
      } else {
        const created = await OpticalApi.createODP(payload);
        savedId = created.id;
      }

      if (photoFile) {
        await OpticalApi.uploadODPPhoto(savedId, photoFile);
      }

      SweetAlert.success("Berhasil", `ODP berhasil ${isEdit ? "diperbarui" : "ditambahkan"}`);
      router.push("/optical/odp");
    } catch (err: any) {
      SweetAlert.error("Error", err?.response?.data?.message ?? err?.message ?? "Gagal menyimpan ODP");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const inputCls = (hasErr?: boolean) =>
    `w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-white ${
      hasErr
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-brand-500 focus:ring-brand-500 dark:border-gray-700"
    }`;

  const mapCenter: [number, number] =
    pickedLat && pickedLng ? [pickedLat, pickedLng] : DEFAULT_CENTER;

  return (
    <div className="flex h-full flex-col">
      {/* ── Breadcrumb & header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
          <Link href="/optical/odp" className="hover:text-brand-500">Jaringan Optik</Link>
          <FiChevronRight className="h-3 w-3" />
          <Link href="/optical/odp" className="hover:text-brand-500">ODP</Link>
          <FiChevronRight className="h-3 w-3" />
          <span className="text-gray-600 dark:text-gray-300">
            {isEdit ? `Edit — ${odpName || "..."}` : "Tambah ODP"}
          </span>
        </nav>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Edit ODP" : "Tambah ODP"}
          </h1>
          <Link
            href="/optical/odp"
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <FiArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Form */}
        <div className="w-full overflow-y-auto lg:w-[42%] xl:w-[38%]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6">

            {/* Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nama ODP <span className="text-red-500">*</span>
              </label>
              <input
                {...register("name")}
                placeholder="ODP-JKT-001"
                className={inputCls(!!errors.name)}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>

            {/* Total ports + Used ports */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Total Port
                </label>
                <select
                  {...register("total_ports", { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— Pilih —</option>
                  {[8, 16, 32].map((n) => (
                    <option key={n} value={n}>{n} port</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Port Terpakai
                </label>
                <input
                  {...register("used_ports", { valueAsNumber: true })}
                  type="number"
                  min={0}
                  placeholder="0"
                  className={inputCls(!!errors.used_ports)}
                />
                {errors.used_ports && <p className="mt-1 text-xs text-red-500">{errors.used_ports.message}</p>}
              </div>
            </div>

            {/* Router + Teknisi */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Router Mikrotik
                </label>
                <select
                  {...register("mikrotik_id", { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— Tidak dipilih —</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Teknisi
                </label>
                <select
                  {...register("technician_id", { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— Tidak dipilih —</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Serial + IP */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Serial</label>
                <div className="flex gap-2">
                  <input {...register("serial")} className={`${inputCls()} flex-1`} />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    title="Pilih dari GenieACS"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <FiCpu className="h-3.5 w-3.5" />
                    GenieACS
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">IP Address</label>
                <input {...register("ip_address")} placeholder="192.168.x.x" className={inputCls()} />
              </div>
            </div>

            {/* Location info (read-only display) */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Lokasi
              </p>
              {pickedLat && pickedLng ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                      <FiMapPin className="h-3.5 w-3.5 text-brand-500" />
                      {pickedLat.toFixed(6)}, {pickedLng.toFixed(6)}
                    </span>
                    <button
                      type="button"
                      onClick={clearLocation}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      <FiX className="h-4 w-4" />
                    </button>
                  </div>
                  {nearestRouter && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Router terdekat: <span className="font-medium text-gray-600 dark:text-gray-300">{nearestRouter.name}</span>
                      {" "}({nearestRouter.distanceM < 1000
                        ? `${nearestRouter.distanceM} m`
                        : `${(nearestRouter.distanceM / 1000).toFixed(1)} km`})
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Klik pada peta untuk menentukan lokasi ODP
                </p>
              )}
            </div>

            {/* Photo upload */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Foto ODP</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 transition-colors hover:border-brand-500 dark:border-gray-600 dark:hover:border-brand-400"
              >
                {photoPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Preview" className="h-44 w-full rounded-xl object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                      <span className="text-sm font-medium text-white">Ganti Foto</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400">
                    <FiImage className="h-10 w-10" />
                    <span className="text-sm">Klik untuk upload foto</span>
                    <span className="text-xs">JPG, PNG, WebP — maks. 5 MB</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
              {photoFile && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <FiUpload className="h-3.5 w-3.5" />
                  {photoFile.name}
                </div>
              )}
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                {...register("is_active")}
                type="checkbox"
                id="odp-active"
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <label htmlFor="odp-active" className="text-sm text-gray-700 dark:text-gray-300">Aktif</label>
            </div>

            {/* GenieACS Picker */}
            <GenieACSPickerModal
              isOpen={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={(serial) => {
                setValue("serial", serial);
                setPickerOpen(false);
              }}
            />

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Link
                href="/optical/odp"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={isSaving || loadingData}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                <FiSave className="h-4 w-4" />
                {isSaving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah ODP"}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT: Map */}
        <div className="relative hidden flex-1 flex-col lg:flex">
          {/* Layer switcher */}
          <div className="absolute right-3 top-3 z-[1000] flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-md dark:border-gray-700 dark:bg-gray-900">
            <FiLayers className="ml-1.5 mr-0.5 h-4 w-4 text-gray-400" />
            {(Object.keys(MAP_LAYERS) as LayerKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedLayer(key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedLayer === key
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {MAP_LAYERS[key].name}
              </button>
            ))}
          </div>

          {/* Instruction banner */}
          <div className="absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2">
            <div className="rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-xs font-medium text-gray-600 shadow-md backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300">
              <FiMapPin className="mr-1.5 inline h-3.5 w-3.5 text-brand-500" />
              Klik pada peta untuk menentukan lokasi ODP
            </div>
          </div>

          {mapReady && (
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
              className="z-0 flex-1"
            >
              <TileLayer
                key={selectedLayer}
                url={MAP_LAYERS[selectedLayer].url}
                attribution={MAP_LAYERS[selectedLayer].attribution}
              />
              <MapClickHandler onMapClick={handleLocationChange} />
              {pickedLat && pickedLng && odpMarkerIcon && (
                <>
                  <RecenterMap lat={pickedLat} lng={pickedLng} />
                  <Marker position={[pickedLat, pickedLng]} icon={odpMarkerIcon}>
                    <Popup>
                      <div className="min-w-[160px] p-2">
                        <p className="font-semibold text-gray-900">
                          {odpName || "ODP Baru"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {pickedLat.toFixed(6)}, {pickedLng.toFixed(6)}
                        </p>
                        {nearestRouter && (
                          <p className="mt-1 text-xs text-gray-400">
                            Router: {nearestRouter.name} ({nearestRouter.distanceM < 1000
                              ? `${nearestRouter.distanceM} m`
                              : `${(nearestRouter.distanceM / 1000).toFixed(1)} km`})
                          </p>
                        )}
                        <button
                          onClick={clearLocation}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                        >
                          <FiX className="h-3 w-3" /> Hapus lokasi
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                </>
              )}
            </MapContainer>
          )}

          {!mapReady && (
            <div className="flex flex-1 items-center justify-center bg-gray-100 dark:bg-gray-800">
              <div className="text-sm text-gray-400">Memuat peta...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
