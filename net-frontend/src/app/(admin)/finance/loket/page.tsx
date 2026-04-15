import { Metadata } from "next";
import { LoketComponent } from "@/components/finance/LoketComponent";

export const metadata: Metadata = {
  title: "Loket Pembayaran | Net Monitoring",
};

export default function LoketPage() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-5 lg:mb-7">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Loket Pembayaran
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Catat pembayaran pelanggan secara manual
        </p>
      </div>
      <LoketComponent />
    </div>
  );
}
