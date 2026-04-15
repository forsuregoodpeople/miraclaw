import { FiWifiOff } from "react-icons/fi";
import { Pelanggan } from "@/lib/api/pelanggan";
import { Customer } from "@/lib/api/customer";
import { Invoice } from "@/lib/api/finance";
import { PelangganRow } from "./PelangganRow";

interface TableContentProps {
  isLoading: boolean;
  data: Pelanggan[];
  filtered: Pelanggan[];
  paginated: Pelanggan[];
  hasFilter: boolean;
  startIndex: number;
  loadingIsolir: Record<string, boolean>;
  kelolaLoadingId: string | null;
  customerMap: Map<string, Customer>;
  invoiceMap: Map<number, Invoice>;
  onIsolir: (p: Pelanggan) => void;
  onUnIsolir: (p: Pelanggan) => void;
  onBlock: (p: Pelanggan) => void;
  onBayar: (p: Pelanggan) => void;
  onKelola: (p: Pelanggan) => void;
}

export function TableContent({
  isLoading,
  data,
  filtered,
  paginated,
  hasFilter,
  startIndex,
  loadingIsolir,
  kelolaLoadingId,
  customerMap,
  invoiceMap,
  onIsolir,
  onUnIsolir,
  onBlock,
  onBayar,
  onKelola,
}: TableContentProps) {
  return (
    <div className="overflow-x-hidden sm:overflow-x-auto">
      <table className="w-full table-fixed sm:table-auto">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
            {/* # */}
            <th className="px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-8 sm:w-auto">#</th>
            {/* Mobile: Komentar / Nama */}
            <th className="px-2 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate sm:hidden">Komentar / Nama</th>
            {/* Desktop: Komentar */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Komentar</th>
            {/* Tipe - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Tipe</th>
            {/* Paket - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Paket</th>
            {/* IP - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">IP</th>
            {/* MAC - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">MAC</th>
            {/* Status - center aligned */}
            <th className="px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-16 sm:w-auto">Status</th>
            {/* Tagihan - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Tagihan</th>
            {/* Last Seen - desktop only */}
            <th className="whitespace-nowrap px-3 py-2 md:px-6 md:py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Last Seen</th>
            {/* Aksi */}
            <th className="px-1 py-3 sm:whitespace-nowrap sm:px-3 sm:py-2 md:px-6 md:py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-[95px] sm:w-auto">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.02]">
          {isLoading && data.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="animate-pulse">
                {Array.from({ length: 11 }).map((_, j) => (
                  <td
                    key={j}
                    className={`px-1 py-3 sm:px-3 sm:py-2 md:px-6 md:py-4 ${
                      j === 1 ? 'sm:hidden' :
                      j === 2 || j === 3 ? 'hidden sm:table-cell' :
                      j === 4 || j === 5 || j === 8 ? 'hidden md:table-cell' :
                      j === 6 || j === 9 ? 'hidden lg:table-cell' : ''
                    }`}
                  >
                    <div
                      className="h-4 rounded bg-gray-200 dark:bg-gray-700"
                      style={{
                        width: j === 0 ? 24 : j === 1 || j === 2 ? 120 : j === 10 ? 60 : 80,
                        margin: j === 7 ? '0 auto' : undefined
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : filtered.length > 0 ? (
            paginated.map((p, i) => (
              <PelangganRow
                key={p.id}
                p={p}
                index={i}
                startIndex={startIndex}
                loadingId={!!loadingIsolir[p.id]}
                kelolaLoading={kelolaLoadingId === p.id}
                customer={customerMap.get(p.id)}
                invoice={customerMap.get(p.id) ? invoiceMap.get(customerMap.get(p.id)!.id) : undefined}
                onIsolir={onIsolir}
                onUnIsolir={onUnIsolir}
                onBlock={onBlock}
                onBayar={onBayar}
                onKelola={onKelola}
              />
            ))
          ) : (
            <tr>
              <td colSpan={10} className="px-6 py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <FiWifiOff className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {hasFilter ? "Tidak ada pelanggan yang cocok dengan filter" : "Tidak ada data pelanggan"}
                  </p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
