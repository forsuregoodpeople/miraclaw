"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, PaymentFormData } from "@/lib/schema";
import { FinanceApi } from "@/lib/api/finance";
import { useTariff } from "@/lib/hooks/useFinance";
import { SweetAlert } from "@/lib/sweetalert";
import { Customer } from "@/lib/api/customer";
import { MikrotikRouter } from "@/lib/api/mikrotik";
import { FiX, FiUpload, FiCreditCard } from "react-icons/fi";

const PAYMENT_METHODS = [
  { value: "CASH",     label: "Tunai" },
  { value: "TRANSFER", label: "Transfer Bank" },
  { value: "E-WALLET", label: "E-Wallet" },
] as const;

const TYPE_BADGE: Record<string, string> = {
  PPPOE:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DHCP:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const formatRupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

interface Props {
  customer: Customer;
  router: MikrotikRouter;
  onClose: () => void;
}

export function QuickPayModal({ customer, router, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { tariff } = useTariff(customer.id);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      customer_id:    customer.id,
      payment_method: "CASH",
      payment_date:   new Date().toISOString(),
      billing_period: new Date().toISOString().slice(0, 7),
      receipt: null,
    },
  });

  const paymentMethod = useWatch({ control, name: "payment_method" });
  const needsReceipt  = paymentMethod === "TRANSFER" || paymentMethod === "E-WALLET";

  // Auto-fill amount from tariff
  useEffect(() => {
    if (tariff && tariff.monthly_fee > 0) {
      setValue("amount", tariff.monthly_fee, { shouldValidate: false });
    }
  }, [tariff, setValue]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setValue("receipt", file, { shouldValidate: true });
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const clearFile = () => {
    setValue("receipt", null, { shouldValidate: true });
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (data: PaymentFormData) => {
    try {
      await FinanceApi.createPayment({
        ...data,
        customer_name: customer.name,
        receipt:   data.receipt ?? undefined,
        router_id: router.id,
      });
      SweetAlert.success("Berhasil", `Pembayaran ${customer.name} berhasil dicatat`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan pembayaran";
      SweetAlert.error("Gagal", msg);
    }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-modal-panel w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FiCreditCard className="h-5 w-5 text-brand-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Catat Pembayaran</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Customer chip */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-white/90">{customer.name}</span>
            <span className="text-xs text-gray-400">#{customer.id}</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[customer.type] ?? ""}`}>
              {customer.type}
            </span>
            {tariff && tariff.monthly_fee > 0 && (
              <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                Tarif: {formatRupiah(tariff.monthly_fee)}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="max-h-[65vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Hidden customer_id */}
            <input type="hidden" {...register("customer_id", { valueAsNumber: true })} />

            {/* Amount */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Jumlah (Rp) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                placeholder="150000"
                {...register("amount", { valueAsNumber: true })}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
              {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
            </div>

            {/* Payment method */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Metode Pembayaran <span className="text-red-500">*</span>
              </label>
              <select
                {...register("payment_method")}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {errors.payment_method && <p className="mt-1 text-xs text-red-500">{errors.payment_method.message}</p>}
            </div>

            {/* Billing period */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Periode Tagihan <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                {...register("billing_period")}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
              {errors.billing_period && <p className="mt-1 text-xs text-red-500">{errors.billing_period.message}</p>}
            </div>

            {/* Payment date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tanggal Pembayaran <span className="text-red-500">*</span>
              </label>
              <Controller
                name="payment_date"
                control={control}
                render={({ field }) => (
                  <input
                    type="date"
                    value={field.value ? field.value.slice(0, 10) : ""}
                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
                  />
                )}
              />
              {errors.payment_date && <p className="mt-1 text-xs text-red-500">{errors.payment_date.message}</p>}
            </div>

            {/* Note */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Catatan</label>
              <textarea
                {...register("note")}
                rows={2}
                placeholder="Opsional"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              />
            </div>

            {/* Receipt — only for TRANSFER / E-WALLET */}
            {needsReceipt && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Bukti Transfer / Pembayaran <span className="text-red-500">*</span>
                </label>
                {previewUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview bukti" className="h-28 w-auto rounded-lg border border-gray-200 object-cover dark:border-gray-700" />
                    <button
                      type="button"
                      onClick={clearFile}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white p-5 text-center transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-700">
                    <FiUpload className="mb-2 h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Klik untuk unggah bukti</span>
                    <span className="mt-1 text-xs text-gray-400">JPG, PNG, WebP — maks. 5 MB</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
                {errors.receipt && <p className="mt-1 text-xs text-red-500">{errors.receipt.message as string}</p>}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              <FiCreditCard className="h-4 w-4" />
              {isSubmitting ? "Menyimpan..." : "Bayar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
