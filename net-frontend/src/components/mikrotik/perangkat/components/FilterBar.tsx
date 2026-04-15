"use client";

import React from "react";
import { FiSearch, FiFilter, FiRefreshCw } from "react-icons/fi";

type StatusFilter = "all" | "active" | "inactive";

interface FilterBarProps {
  filteredCount: number;
  totalCount: number;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (val: StatusFilter) => void;
  canCRUD: boolean;
  isRefreshing: boolean;
  onAddRouter: () => void;
}

export function FilterBar({
  filteredCount,
  totalCount,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  canCRUD,
  isRefreshing,
  onAddRouter,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Daftar Router Mikrotik ({filteredCount} / {totalCount})
        </h2>
        {isRefreshing && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <FiRefreshCw className="h-3 w-3 animate-spin" />
            <span>Memperbarui...</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama atau host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 sm:w-64"
          />
        </div>

        <div className="relative">
          <FiFilter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-40"
          >
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak Aktif</option>
          </select>
        </div>

        {canCRUD && (
          <button
            onClick={onAddRouter}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
          >
            + Tambah Router
          </button>
        )}
      </div>
    </div>
  );
}
