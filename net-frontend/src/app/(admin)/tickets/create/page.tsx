import { TicketCreateForm } from "@/components/ticket/TicketCreateForm";

export const metadata = { title: "Buat Tiket - Net Monitoring" };

export default function CreateTicketPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buat Tiket</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Laporkan gangguan jaringan atau keluhan pelanggan
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <TicketCreateForm />
      </div>
    </div>
  );
}
