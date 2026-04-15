import { TicketListComponent } from "@/components/ticket/TicketListComponent";

export const metadata = { title: "Tiket - Net Monitoring" };

export default function TicketsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tiket</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manajemen tiket operasional jaringan
        </p>
      </div>
      <TicketListComponent />
    </div>
  );
}
