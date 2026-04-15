import { Metadata } from "next";
import { TagihanComponent } from "@/components/finance/TagihanComponent";

export const metadata: Metadata = {
  title: "Tagihan | Net Monitoring",
};

export default function TagihanPage() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-5 lg:mb-7">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Tagihan
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Kelola tagihan bulanan pelanggan
        </p>
      </div>
      <TagihanComponent />
    </div>
  );
}
