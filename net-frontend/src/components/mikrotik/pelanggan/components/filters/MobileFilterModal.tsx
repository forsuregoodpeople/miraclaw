import { FiX, FiRefreshCw } from "react-icons/fi";
import { Tab, StatusFilter, ProfileFilter, SortBy } from "../types";

interface MobileFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  activeTab: Tab;
  setActiveTab: (v: Tab) => void;
  profileFilter: ProfileFilter;
  setProfileFilter: (v: ProfileFilter) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  ipFilter: string;
  setIpFilter: (v: string) => void;
  macFilter: string;
  setMacFilter: (v: string) => void;
  isLoading: boolean;
  syncingPelanggan: boolean;
  syncingPackages: boolean;
  handleSyncPelanggan: () => void;
  handleSyncPackages: () => void;
  statusFilterOptions: { key: StatusFilter; label: string; color: string }[];
  tabOptions: { key: Tab; label: string }[];
  profileOptions: { key: ProfileFilter; label: string }[];
}

export function MobileFilterModal({
  isOpen,
  onClose,
  statusFilter,
  setStatusFilter,
  activeTab,
  setActiveTab,
  profileFilter,
  setProfileFilter,
  sortBy,
  setSortBy,
  ipFilter,
  setIpFilter,
  macFilter,
  setMacFilter,
  isLoading,
  syncingPelanggan,
  syncingPackages,
  handleSyncPelanggan,
  handleSyncPackages,
  statusFilterOptions,
  tabOptions,
  profileOptions,
}: MobileFilterModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white p-4 dark:bg-gray-900 animate-in slide-in-from-bottom">
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filter</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pb-20">
          {/* Status */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <div className="flex flex-wrap gap-2">
              {statusFilterOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    statusFilter === opt.key
                      ? `bg-${opt.color}-100 text-${opt.color}-700 border border-${opt.color}-300 dark:bg-${opt.color}-900/30 dark:text-${opt.color}-400`
                      : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Tipe */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe</label>
            <div className="flex flex-wrap gap-2">
              {tabOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setActiveTab(opt.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    activeTab === opt.key
                      ? "bg-brand-100 text-brand-700 border border-brand-300 dark:bg-brand-900/30 dark:text-brand-400"
                      : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Profil */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Profil</label>
            <div className="flex flex-wrap gap-2">
              {profileOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setProfileFilter(opt.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    profileFilter === opt.key
                      ? "bg-yellow-100 text-yellow-700 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Sort */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Urutan</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="default">Default</option>
              <option value="name_asc">Nama A→Z</option>
              <option value="name_desc">Nama Z→A</option>
              <option value="ip_asc">IP Menaik</option>
              <option value="ip_desc">IP Menurun</option>
              {statusFilter === "down" && (
                <option value="last_seen_asc">Paling Lama Terputus</option>
              )}
            </select>
          </div>
          {/* Prefix Filters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Prefix IP</label>
              <input
                type="text"
                placeholder="192.168.1"
                value={ipFilter}
                onChange={(e) => setIpFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Prefix MAC</label>
              <input
                type="text"
                placeholder="AA:BB:CC"
                value={macFilter}
                onChange={(e) => setMacFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={handleSyncPelanggan}
              disabled={isLoading || syncingPelanggan}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-600 disabled:opacity-50 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${syncingPelanggan ? "animate-spin" : ""}`} />
              Sync MikroTik
            </button>
            <button
              onClick={handleSyncPackages}
              disabled={isLoading || syncingPackages}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-600 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${syncingPackages ? "animate-spin" : ""}`} />
              Sync Paket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
