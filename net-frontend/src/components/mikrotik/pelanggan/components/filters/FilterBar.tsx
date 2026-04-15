import { FiRefreshCw } from "react-icons/fi";
import { Tab, StatusFilter, ProfileFilter, SortBy } from "../types";

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  ipFilter: string;
  setIpFilter: (v: string) => void;
  macFilter: string;
  setMacFilter: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  activeTab: Tab;
  setActiveTab: (v: Tab) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  profileFilter: ProfileFilter;
  setProfileFilter: (v: ProfileFilter) => void;
  hasFilter: boolean;
  resetFilters: () => void;
  isLoading: boolean;
  syncingPelanggan: boolean;
  syncingPackages: boolean;
  syncingCustomers: boolean;
  handleSyncPelanggan: () => void;
  handleSyncPackages: () => void;
  smoothRefresh: () => void;
  isRefreshing: boolean;
}

export function FilterBar({
  searchQuery,
  setSearchQuery,
  ipFilter,
  setIpFilter,
  macFilter,
  setMacFilter,
  statusFilter,
  setStatusFilter,
  activeTab,
  setActiveTab,
  sortBy,
  setSortBy,
  profileFilter,
  setProfileFilter,
  hasFilter,
  resetFilters,
  isLoading,
  syncingPelanggan,
  syncingPackages,
  syncingCustomers,
  handleSyncPelanggan,
  handleSyncPackages,
  smoothRefresh,
  isRefreshing,
}: FilterBarProps) {
  return (
    <div className="hidden sm:flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Prefix IP (contoh: 192.168.1)"
        value={ipFilter}
        onChange={(e) => setIpFilter(e.target.value)}
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      <input
        type="text"
        placeholder="Prefix MAC (contoh: AA:BB:CC)"
        value={macFilter}
        onChange={(e) => setMacFilter(e.target.value)}
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        <option value="all">Semua Status</option>
        <option value="up">Aktif (UP)</option>
        <option value="down">Putus (DOWN)</option>
        <option value="isolir">Terisolir</option>
      </select>
      <select
        value={activeTab}
        onChange={(e) => setActiveTab(e.target.value as Tab)}
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        <option value="ALL">Semua Tipe</option>
        <option value="DHCP">DHCP</option>
        <option value="PPPOE">PPPoE</option>
        <option value="STATIC">Static</option>
      </select>
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortBy)}
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      >
        <option value="default">Urutan Default</option>
        <option value="name_asc">Nama A→Z</option>
        <option value="name_desc">Nama Z→A</option>
        <option value="ip_asc">IP Menaik</option>
        <option value="ip_desc">IP Menurun</option>
        {statusFilter === "down" && (
          <option value="last_seen_asc">Paling Lama Terputus</option>
        )}
      </select>
      <select
        value={profileFilter}
        onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
        className={`rounded-lg border px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:bg-gray-800 dark:text-white ${
          profileFilter === "incomplete"
            ? "border-yellow-400 bg-yellow-50 text-yellow-700 dark:border-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400"
            : "border-gray-300 bg-gray-50 dark:border-gray-700"
        }`}
      >
        <option value="all">Semua Profil</option>
        <option value="incomplete">Belum Ada WhatsApp</option>
        <option value="has_wa">Sudah Ada WhatsApp</option>
        <option value="no_comment">Belum Ada Komentar</option>
      </select>
      {hasFilter && (
        <button
          onClick={resetFilters}
          className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
        >
          Reset Filter
        </button>
      )}
      <button
        onClick={handleSyncPelanggan}
        disabled={isLoading || syncingPelanggan || syncingPackages || syncingCustomers}
        className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm text-green-600 hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
      >
        <FiRefreshCw className={`h-3.5 w-3.5 ${syncingPelanggan ? "animate-spin" : ""}`} />
        {syncingPelanggan ? "Menyinkronkan..." : "Sync MikroTik"}
      </button>
      <button
        onClick={handleSyncPackages}
        disabled={isLoading || syncingPackages || syncingCustomers || syncingPelanggan}
        className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
      >
        <FiRefreshCw className={`h-3.5 w-3.5 ${syncingPackages ? "animate-spin" : ""}`} />
        {syncingPackages ? "Menyinkronkan..." : "Sinkronkan Paket"}
      </button>
      <button
        onClick={smoothRefresh}
        disabled={isLoading || isRefreshing}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <FiRefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        Refresh
      </button>
    </div>
  );
}
