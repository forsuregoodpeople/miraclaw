"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FiUser, FiAlertCircle } from "react-icons/fi";
import { ticketSchema, TicketFormData } from "@/lib/schema";
import { TicketApi } from "@/lib/api/ticket";
import { Customer } from "@/lib/api/customer";
import { MikrotikRouter } from "@/lib/api/mikrotik";
import { CustomerPickerModal } from "@/components/finance/CustomerPickerModal";
import { DuplicateWarningModal } from "./DuplicateWarningModal";
import { SweetAlert } from "@/lib/sweetalert";

const CATEGORIES = [
  { value: "INTERNET_DOWN", label: "Internet Down" },
  { value: "LOS",           label: "LOS (Loss of Signal)" },
  { value: "SLOW",          label: "Koneksi Lambat" },
  { value: "NO_SIGNAL",     label: "No Signal" },
  { value: "HARDWARE",      label: "Hardware" },
  { value: "BILLING",       label: "Tagihan" },
  { value: "OTHER",         label: "Lainnya" },
] as const;

const PRIORITIES = [
  { value: "LOW",      label: "Low — 24 jam" },
  { value: "MEDIUM",   label: "Medium — 8 jam" },
  { value: "HIGH",     label: "High — 4 jam" },
  { value: "CRITICAL", label: "Critical — 2 jam" },
] as const;

export function TicketCreateForm() {
  const router = useRouter();
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pendingDuplicates, setPendingDuplicates] = useState<Awaited<ReturnType<typeof TicketApi.checkDuplicate>>["tickets"] | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<TicketFormData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { priority: "MEDIUM" },
  });

  const handlePickCustomer = useCallback((customer: Customer, router: MikrotikRouter) => {
    setSelectedCustomer(customer);
    setValue("customer_id", customer.id, { shouldValidate: true });
    setValue("customer_name", customer.name);
    setValue("mikrotik_ref", customer.mikrotik_ref ?? "");
    setValue("router_id", router.id);
    setShowCustomerPicker(false);
  }, [setValue]);

  const doSubmit = async (data: TicketFormData) => {
    setSubmitting(true);
    try {
      await TicketApi.create({
        ...data,
        customer_id: data.customer_id,
        customer_name: data.customer_name,
      });
      SweetAlert.success("Tiket berhasil dibuat");
      router.push("/tickets");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membuat tiket";
      SweetAlert.error("Gagal", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (data: TicketFormData) => {
    // Duplicate check first
    const dupResult = await TicketApi.checkDuplicate({
      customer_id: data.customer_id,
      mikrotik_ref: data.mikrotik_ref,
    }).catch(() => ({ has_duplicate: false, tickets: [] }));

    if (dupResult.has_duplicate) {
      setPendingDuplicates(dupResult.tickets);
      setPendingSubmit(data);
      return;
    }
    await doSubmit(data);
  };

  const handleIgnoreDuplicate = async () => {
    if (!pendingSubmit) return;
    setPendingDuplicates(null);
    await doSubmit(pendingSubmit);
    setPendingSubmit(null);
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90";
  const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";
  const errorClass = "mt-1 text-xs text-red-500";

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Customer picker */}
        <div>
          <label className={labelClass}>Pelanggan *</label>
          <button
            type="button"
            onClick={() => setShowCustomerPicker(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600 transition hover:border-brand-400 hover:bg-brand-50/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            <FiUser className="h-4 w-4" />
            {selectedCustomer ? (
              <span className="font-medium text-gray-800 dark:text-white/90">
                {selectedCustomer.name}
                <span className="ml-2 font-normal text-gray-400">({selectedCustomer.mikrotik_ref})</span>
              </span>
            ) : (
              "Pilih pelanggan dari daftar..."
            )}
          </button>
          {errors.customer_id && (
            <p className={errorClass}>{errors.customer_id.message}</p>
          )}
        </div>

        {/* PPPoE ref (editable after customer pick, or manual) */}
        <div>
          <label className={labelClass}>PPPoE / ONU Ref</label>
          <input {...register("mikrotik_ref")} placeholder="Contoh: pppoe-johndoe" className={inputClass} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Category */}
          <div>
            <label className={labelClass}>Kategori *</label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <select {...field} className={inputClass}>
                  <option value="">Pilih kategori...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              )}
            />
            {errors.category && <p className={errorClass}>{errors.category.message}</p>}
          </div>

          {/* Priority */}
          <div>
            <label className={labelClass}>Prioritas *</label>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <select {...field} className={inputClass}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              )}
            />
            {errors.priority && <p className={errorClass}>{errors.priority.message}</p>}
          </div>
        </div>

        {/* Location ODP */}
        <div>
          <label className={labelClass}>Lokasi ODP *</label>
          <input {...register("location_odp")} placeholder="Contoh: ODP-JL-MERDEKA-01" className={inputClass} />
          {errors.location_odp && <p className={errorClass}>{errors.location_odp.message}</p>}
        </div>

        {/* Title */}
        <div>
          <label className={labelClass}>Judul *</label>
          <input {...register("title")} placeholder="Ringkasan masalah (min. 5 karakter)" className={inputClass} />
          {errors.title && <p className={errorClass}>{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Deskripsi *</label>
          <textarea
            {...register("description")}
            rows={4}
            placeholder="Jelaskan masalah secara detail (min. 10 karakter)..."
            className={inputClass}
          />
          {errors.description && <p className={errorClass}>{errors.description.message}</p>}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            type="button"
            onClick={() => router.push("/tickets")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting && <FiAlertCircle className="h-4 w-4 animate-pulse" />}
            {submitting ? "Menyimpan..." : "Buat Tiket"}
          </button>
        </div>
      </form>

      {showCustomerPicker && (
        <CustomerPickerModal
          onSelect={handlePickCustomer}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {pendingDuplicates && (
        <DuplicateWarningModal
          tickets={pendingDuplicates}
          onIgnore={handleIgnoreDuplicate}
          onCancel={() => { setPendingDuplicates(null); setPendingSubmit(null); }}
        />
      )}
    </>
  );
}
