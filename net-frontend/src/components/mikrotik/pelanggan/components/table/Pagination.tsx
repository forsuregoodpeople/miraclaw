import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from "react-icons/fi";
import { PAGE_SIZES } from "../types";

interface PaginationProps {
  filtered: { length: number };
  data: { length: number };
  itemsPerPage: number;
  setItemsPerPage: (v: number) => void;
  currentPage: number;
  setCurrentPage: (v: number | ((p: number) => number)) => void;
  totalPages: number;
  visiblePages: (number | string)[];
  hasFilter: boolean;
  startIndex: number;
}

export function Pagination({
  filtered,
  data,
  itemsPerPage,
  setItemsPerPage,
  currentPage,
  setCurrentPage,
  totalPages,
  visiblePages,
  hasFilter,
  startIndex,
}: PaginationProps) {
  if (filtered.length <= itemsPerPage) return null;

  return (
    <div className="border-t border-gray-200 px-2 py-2 dark:border-gray-800 sm:px-4 sm:py-3">
      {/* Mobile pagination */}
      <div className="flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}/hal</option>
            ))}
          </select>
          <span>{startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)}/{filtered.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
            className="rounded border border-gray-300 p-1.5 text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400">
            <FiChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="rounded border border-gray-300 p-1.5 text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400">
            <FiChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs text-gray-600 dark:text-gray-400">
            {currentPage}/{totalPages}
          </span>
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="rounded border border-gray-300 p-1.5 text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400">
            <FiChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
            className="rounded border border-gray-300 p-1.5 text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400">
            <FiChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Desktop pagination */}
      <div className="hidden items-center justify-between sm:flex">
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>
            {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filtered.length)} dari {filtered.length}
            {hasFilter && filtered.length < data.length && (
              <span className="ml-1 text-gray-400">(difilter dari {data.length})</span>
            )}
          </span>
          <span className="text-gray-300">|</span>
          <label className="flex items-center gap-1.5">
            <span>Per halaman:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <FiChevronsLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <FiChevronLeft className="h-4 w-4" />
          </button>
          {visiblePages.map((page, i) =>
            page === "..." ? (
              <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
            ) : (
              <button key={page} onClick={() => setCurrentPage(page as number)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  currentPage === page
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}>
                {page}
              </button>
            )
          )}
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <FiChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
            <FiChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
