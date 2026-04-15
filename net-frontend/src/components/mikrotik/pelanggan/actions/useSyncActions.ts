"use client";

import { useState, useCallback } from "react";
import { PackageApi } from "@/lib/api/packages";
import { CustomerApi } from "@/lib/api/customer";
import { DHCPApi } from "@/lib/api/dhcp";
import { PPPoEApi } from "@/lib/api/pppoe";
import { StaticApi } from "@/lib/api/static";
import { SweetAlert } from "@/lib/sweetalert";

interface UseSyncActionsProps {
  routerId: number;
  fetchData: (silent?: boolean) => Promise<void>;
  refreshCustomerMap: () => Promise<void>;
}

interface UseSyncActionsReturn {
  syncingCustomers: boolean;
  syncingPackages: boolean;
  syncingPelanggan: boolean;
  handleSyncPackages: () => Promise<void>;
  handleSyncPelanggan: () => Promise<void>;
}

export function useSyncActions({
  routerId,
  fetchData,
  refreshCustomerMap,
}: UseSyncActionsProps): UseSyncActionsReturn {
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingPackages, setSyncingPackages] = useState(false);
  const [syncingPelanggan, setSyncingPelanggan] = useState(false);

  const handleSyncPackages = useCallback(async () => {
    setSyncingPackages(true);
    try {
      await Promise.all([
        PackageApi.syncImport(routerId, "PPPOE"),
        PackageApi.syncImport(routerId, "DHCP"),
        PackageApi.syncImport(routerId, "STATIC"),
      ]);
      await CustomerApi.sync(routerId).catch(() => {});
      await refreshCustomerMap();
      SweetAlert.success("Berhasil", "Paket berhasil disinkronkan");
    } catch {
      SweetAlert.error("Gagal", "Gagal menyinkronkan paket");
    } finally {
      setSyncingPackages(false);
    }
  }, [routerId, refreshCustomerMap]);

  const handleSyncPelanggan = useCallback(async () => {
    setSyncingPelanggan(true);
    try {
      await Promise.all([
        DHCPApi.syncFromRouter(routerId),
        PPPoEApi.sync(routerId),
        StaticApi.syncFromRouter(routerId),
      ]);
      await fetchData(true);
      SweetAlert.success("Berhasil", "Data pelanggan berhasil disinkronkan dari MikroTik");
    } catch {
      SweetAlert.error("Gagal", "Gagal sinkronisasi data pelanggan dari MikroTik");
    } finally {
      setSyncingPelanggan(false);
    }
  }, [routerId, fetchData]);

  return {
    syncingCustomers,
    syncingPackages,
    syncingPelanggan,
    handleSyncPackages,
    handleSyncPelanggan,
  };
}
