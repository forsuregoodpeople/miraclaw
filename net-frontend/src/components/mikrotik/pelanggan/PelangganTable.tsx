"use client";

import { useState, useMemo } from "react";
import { FiRefreshCw, FiFilter } from "react-icons/fi";
import { MikrotikRouter } from "@/lib/api/mikrotik";
import { Customer } from "@/lib/api/customer";
import { QuickPayModal } from "./QuickPayModal";
import {
  StatusFilter,
  ProfileFilter,
  SortBy,
  TableHeader,
  TableContent,
  Pagination,
  FilterBar,
  MobileFilterModal,
} from "./components";
import {
  usePelangganData,
  useSyncActions,
  useIsolirActions,
  useCustomerActions,
  useInvoiceData,
  usePelangganFilters,
} from "./actions";

interface Props {
  routerId: number;
  routerName?: string;
}

export function PelangganTable({ routerId, routerName }: Props) {
  // Modal states
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Router ref for modals
  const routerRef = useMemo(
    () => ({ id: routerId, name: routerName ?? "" } as unknown as MikrotikRouter),
    [routerId, routerName]
  );

  // Data hooks
  const {
    data,
    setData,
    isLoading,
    isRefreshing,
    error,
    customerMap,
    setCustomerMap,
    fetchData,
    refreshCustomerMap,
    smoothRefresh,
  } = usePelangganData({ routerId });

  const {
    syncingCustomers,
    syncingPackages,
    syncingPelanggan,
    handleSyncPackages,
    handleSyncPelanggan,
  } = useSyncActions({ routerId, fetchData, refreshCustomerMap });

  const {
    loadingIsolir,
    handleIsolir,
    handleUnIsolir,
    handleBlock,
  } = useIsolirActions({ routerId, setData });

  const {
    kelolaLoadingId,
    handleKelola,
    handleBayar,
  } = useCustomerActions({
    routerId,
    customerMap,
    setCustomerMap,
    setPayingCustomer,
  });

  const { invoiceMap } = useInvoiceData({ routerId });

  const {
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    ipFilter,
    setIpFilter,
    macFilter,
    setMacFilter,
    sortBy,
    setSortBy,
    profileFilter,
    setProfileFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    filtered,
    paginated,
    totalPages,
    startIndex,
    hasFilter,
    visiblePages,
    counts,
    upCount,
    downCount,
    isolirCount,
    resetFilters,
  } = usePelangganFilters({ data, customerMap });

  // Mobile filter options
  const statusFilterOptions = [
    { key: "all" as StatusFilter, label: "Semua", color: "gray" },
    { key: "up" as StatusFilter, label: "Aktif", color: "green" },
    { key: "down" as StatusFilter, label: "Putus", color: "orange" },
    { key: "isolir" as StatusFilter, label: "Terisolir", color: "red" },
  ];

  const tabOptions = [
    { key: "ALL" as const, label: "Semua" },
    { key: "DHCP" as const, label: "DHCP" },
    { key: "PPPOE" as const, label: "PPPoE" },
    { key: "STATIC" as const, label: "Static" },
  ];

  const profileOptions = [
    { key: "all" as ProfileFilter, label: "Semua" },
    { key: "incomplete" as ProfileFilter, label: "Belum Ada WA" },
    { key: "has_wa" as ProfileFilter, label: "Sudah Ada WA" },
    { key: "no_comment" as ProfileFilter, label: "Belum Ada Komentar" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* ── Filter Bar ── */}
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:rounded-xl sm:border sm:p-4">
          {/* Search - Always visible */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cari nama, komentar, IP, MAC, username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 pl-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          {/* Desktop: Full Filters */}
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            ipFilter={ipFilter}
            setIpFilter={setIpFilter}
            macFilter={macFilter}
            setMacFilter={setMacFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            sortBy={sortBy}
            setSortBy={setSortBy}
            profileFilter={profileFilter}
            setProfileFilter={setProfileFilter}
            hasFilter={hasFilter}
            resetFilters={resetFilters}
            isLoading={isLoading}
            syncingPelanggan={syncingPelanggan}
            syncingPackages={syncingPackages}
            syncingCustomers={syncingCustomers}
            handleSyncPelanggan={handleSyncPelanggan}
            handleSyncPackages={handleSyncPackages}
            smoothRefresh={smoothRefresh}
            isRefreshing={isRefreshing}
          />

          {/* Mobile: Filter Button & Quick Actions */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setIsFilterOpen(true)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                hasFilter 
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400" 
                  : "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              <FiFilter className="h-3.5 w-3.5" />
              Filter
              {hasFilter && <span className="ml-1 rounded-full bg-brand-500 px-1.5 text-xs text-white">!</span>}
            </button>
            {hasFilter && (
              <button
                onClick={resetFilters}
                className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              >
                Reset
              </button>
            )}
            <button
              onClick={smoothRefresh}
              disabled={isLoading || isRefreshing}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile Filter Modal */}
        <MobileFilterModal
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profileFilter={profileFilter}
          setProfileFilter={setProfileFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          ipFilter={ipFilter}
          setIpFilter={setIpFilter}
          macFilter={macFilter}
          setMacFilter={setMacFilter}
          isLoading={isLoading}
          syncingPelanggan={syncingPelanggan}
          syncingPackages={syncingPackages}
          handleSyncPelanggan={handleSyncPelanggan}
          handleSyncPackages={handleSyncPackages}
          statusFilterOptions={statusFilterOptions}
          tabOptions={tabOptions}
          profileOptions={profileOptions}
        />

        {/* ── Table Card ── */}
        <div className="overflow-hidden border-y border-gray-200 dark:border-gray-800 sm:rounded-2xl sm:border">
          <TableHeader
            routerName={routerName}
            isRefreshing={isRefreshing}
            syncingPelanggan={syncingPelanggan}
            syncingCustomers={syncingCustomers}
            data={data}
            upCount={upCount}
            downCount={downCount}
            isolirCount={isolirCount}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            counts={counts}
          />

          <TableContent
            isLoading={isLoading}
            data={data}
            filtered={filtered}
            paginated={paginated}
            hasFilter={hasFilter}
            startIndex={startIndex}
            loadingIsolir={loadingIsolir}
            kelolaLoadingId={kelolaLoadingId}
            customerMap={customerMap}
            invoiceMap={invoiceMap}
            onIsolir={handleIsolir}
            onUnIsolir={handleUnIsolir}
            onBlock={handleBlock}
            onBayar={handleBayar}
            onKelola={handleKelola}
          />

          <Pagination
            filtered={filtered}
            data={data}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            totalPages={totalPages}
            visiblePages={visiblePages}
            hasFilter={hasFilter}
            startIndex={startIndex}
          />
        </div>
      </div>

      {payingCustomer && (
        <QuickPayModal
          customer={payingCustomer}
          router={routerRef}
          onClose={() => setPayingCustomer(null)}
        />
      )}
    </>
  );
}
