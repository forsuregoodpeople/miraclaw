"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FiX, FiSearch, FiUser, FiRefreshCw, FiCheckSquare } from "react-icons/fi";
import { MikrotikApi, MikrotikRouter } from "@/lib/api/mikrotik";
import { CustomerApi, Customer } from "@/lib/api/customer";
import { FinanceApi, Invoice } from "@/lib/api/finance";
import { PackageApi, Package } from "@/lib/api/packages";
import { SweetAlert } from "@/lib/sweetalert";

const formatRupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

const TYPE_BADGE: Record<string, string> = {
  PPPOE:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DHCP:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  STATIC: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

interface Props {
  onSelect: (customer: Customer, router: MikrotikRouter) => void;
  onSelectMultiple?: (customers: Customer[], router: MikrotikRouter) => void;
  onClose: () => void;
}

export function CustomerPickerModal({ onSelect, onSelectMultiple, onClose }: Props) {
  const isBulkMode = Boolean(onSelectMultiple);

  const [routers, setRouters]               = useState<MikrotikRouter[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<MikrotikRouter | null>(null);
  const [customers, setCustomers]           = useState<Customer[]>([]);
  const [loadingRouters, setLoadingRouters] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [syncing, setSyncing]               = useState(false);
  const [search, setSearch]                 = useState("");
  const [invoiceMap, setInvoiceMap]         = useState<Map<number, Invoice[]>>(new Map());
  const [selected, setSelected]             = useState<Set<number>>(new Set());
  const [packages, setPackages]             = useState<Package[]>([]);
  const [packageFilter, setPackageFilter]   = useState<number | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(false);

  useEffect(() => {
    MikrotikApi.findAll()
      .then((list) => {
        setRouters(list);
        if (list.length === 1) setSelectedRouter(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingRouters(false));
  }, []);

  // Load packages when router changes
  useEffect(() => {
    if (!selectedRouter) { setPackages([]); setPackageFilter(null); return; }
    setLoadingPackages(true);
    PackageApi.getAll({ router_id: selectedRouter.id })
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoadingPackages(false));
  }, [selectedRouter]);

  const loadCustomers = useCallback(async (routerId: number) => {
    setLoadingCustomers(true);
    setCustomers([]);
    setSelected(new Set());
    try {
      const [result, invoices] = await Promise.all([
        CustomerApi.getAll({ router_id: routerId }),
        FinanceApi.getInvoices(),
      ]);
      setCustomers(result);
      const map = new Map<number, Invoice[]>();
      invoices.filter((inv) => inv.status !== "PAID").forEach((inv) => {
        if (!map.has(inv.customer_id)) map.set(inv.customer_id, []);
        map.get(inv.customer_id)!.push(inv);
      });
      setInvoiceMap(map);
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  const syncAndLoad = useCallback(async (routerId: number) => {
    setSyncing(true);
    try {
      await CustomerApi.sync(routerId);
    } catch {
      // silently continue — sync failure shouldn't block loading
    } finally {
      setSyncing(false);
    }
    await loadCustomers(routerId);
  }, [loadCustomers]);

  // Auto-sync whenever router is selected
  useEffect(() => {
    if (!selectedRouter) return;
    syncAndLoad(selectedRouter.id);
  }, [selectedRouter, syncAndLoad]);

  const handleSync = async () => {
    if (!selectedRouter) return;
    setSyncing(true);
    try {
      const result = await CustomerApi.sync(selectedRouter.id);
      SweetAlert.success(
        "Sinkronisasi selesai",
        `+${result.created} baru, ${result.updated} diperbarui${result.deactivated > 0 ? `, ${result.deactivated} dinonaktifkan` : ""}`
      );
    } catch {
      SweetAlert.success("Sinkronisasi selesai");
    } finally {
      setSyncing(false);
    }
    await loadCustomers(selectedRouter.id);
  };

  const filtered = useMemo(() => {
    let list = customers;
    if (packageFilter !== null) {
      list = list.filter((c) => c.package_id === packageFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mikrotik_ref.toLowerCase().includes(q) ||
          String(c.id).includes(q)
      );
    }
    return list;
  }, [customers, packageFilter, search]);

  // ── Bulk selection helpers ──────────────────────────────────────────────────

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someFilteredSelected =
    filtered.some((c) => selected.has(c.id)) && !allFilteredSelected;

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const handleConfirmBulk = () => {
    if (!selectedRouter || selected.size === 0) return;
    const picked = customers.filter((c) => selected.has(c.id));
    onSelectMultiple!(picked, selectedRouter);
    onClose();
  };

  const handleRowClick = (c: Customer) => {
    if (isBulkMode) {
      toggleOne(c.id);
    } else {
      onSelect(c, selectedRouter!);
      onClose();
    }
  };

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="animate-modal-panel flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {isBulkMode ? (
              <FiCheckSquare className="h-5 w-5 text-brand-500" />
            ) : (
              <FiUser className="h-5 w-5 text-brand-500" />
            )}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isBulkMode ? "Pilih Beberapa Pelanggan" : "Pilih Pelanggan"}
            </h3>
            {isBulkMode && selected.size > 0 && (
              <span className="ml-1 inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                {selected.size} dipilih
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/60 sm:flex-row sm:items-center">
          <select
            value={selectedRouter?.id ?? ""}
            onChange={(e) => {
              const r = routers.find((r) => r.id === Number(e.target.value)) ?? null;
              setSelectedRouter(r);
              setSearch("");
            }}
            disabled={loadingRouters}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 sm:w-48"
          >
            <option value="">{loadingRouters ? "Memuat router..." : "Pilih router"}</option>
            {routers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {selectedRouter && (
            <select
              value={packageFilter ?? ""}
              onChange={(e) => setPackageFilter(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingPackages || packages.length === 0}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 sm:w-44"
            >
              <option value="">
                {loadingPackages ? "Memuat paket..." : packages.length === 0 ? "Belum ada paket" : "Semua Paket"}
              </option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, ID, atau referensi..."
              disabled={!selectedRouter}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
            />
          </div>

          {selectedRouter && (
            <button
              onClick={handleSync}
              disabled={syncing || loadingCustomers}
              title="Sinkronisasi dari Mikrotik"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
            >
              <FiRefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {!selectedRouter ? (
            <p className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
              Pilih router untuk menampilkan daftar pelanggan
            </p>
          ) : loadingCustomers || syncing ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {search ? "Tidak ada pelanggan yang cocok" : "Belum ada pelanggan terdaftar"}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  {isBulkMode && (
                    <th className="py-3 pl-4 pr-2 text-left">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                    </th>
                  )}
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nama</th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tipe</th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden sm:table-cell">Referensi</th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tagihan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/2">
                {filtered.map((c) => {
                  const unpaid  = invoiceMap.get(c.id) ?? [];
                  const total   = unpaid.reduce((s, inv) => s + inv.amount_due, 0);
                  const isChecked = selected.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleRowClick(c)}
                      className={`cursor-pointer transition-colors hover:bg-brand-50 dark:hover:bg-brand-900/10 ${isChecked ? "bg-brand-50/60 dark:bg-brand-900/10" : ""}`}
                    >
                      {isBulkMode && (
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(c.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                          />
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-800 dark:text-white/90">{c.name}</div>
                        <div className="text-xs text-gray-400">#{c.id}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[c.type] ?? ""}`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-gray-500 hidden sm:table-cell">
                        {c.mikrotik_ref || "—"}
                      </td>
                      <td className="py-3 pr-5">
                        {unpaid.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              {unpaid.length} tagihan
                            </span>
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                              {formatRupiah(total)}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Lunas
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <span className="text-xs text-gray-400">
            {selectedRouter && !loadingCustomers && !syncing
              ? `${filtered.length} pelanggan${search ? ` dari ${customers.length}` : ""}`
              : ""}
          </span>

          {isBulkMode && (
            <button
              onClick={handleConfirmBulk}
              disabled={selected.size === 0 || !selectedRouter}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              <FiCheckSquare className="h-4 w-4" />
              Pilih {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
