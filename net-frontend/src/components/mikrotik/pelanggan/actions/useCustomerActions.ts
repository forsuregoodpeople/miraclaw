"use client";

import { useState, useCallback } from "react";
import { Pelanggan } from "@/lib/api/pelanggan";
import { Customer, CustomerApi } from "@/lib/api/customer";
import { SweetAlert } from "@/lib/sweetalert";
import { useRouter } from "next/navigation";

interface UseCustomerActionsProps {
  routerId: number;
  customerMap: Map<string, Customer>;
  setCustomerMap: React.Dispatch<React.SetStateAction<Map<string, Customer>>>;
  setPayingCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
}

interface UseCustomerActionsReturn {
  kelolaLoadingId: string | null;
  handleKelola: (p: Pelanggan) => Promise<void>;
  handleBayar: (p: Pelanggan) => Promise<void>;
}

export function useCustomerActions({
  routerId,
  customerMap,
  setCustomerMap,
  setPayingCustomer,
}: UseCustomerActionsProps): UseCustomerActionsReturn {
  const [kelolaLoadingId, setKelolaLoadingId] = useState<string | null>(null);
  const router = useRouter();

  const handleKelola = useCallback(async (p: Pelanggan) => {
    const existing = customerMap.get(p.id);
    if (existing) {
      router.push(`/customers/${existing.id}`);
      return;
    }
    setKelolaLoadingId(p.id);
    try {
      await CustomerApi.import(routerId, [{
        name: p.comment || p.name || p.id,
        type: p.type as "PPPOE" | "DHCP" | "STATIC",
        mikrotik_ref: p.id,
      }]);
      const list = await CustomerApi.getAll({ router_id: routerId });
      const map = new Map<string, Customer>();
      list.forEach((c) => { if (c.mikrotik_ref) map.set(c.mikrotik_ref, c); });
      setCustomerMap(map);
      const newCustomer = list.find((c) => c.mikrotik_ref === p.id);
      if (newCustomer) router.push(`/customers/${newCustomer.id}`);
    } catch {
      SweetAlert.error("Gagal", "Gagal membuat data pelanggan");
    } finally {
      setKelolaLoadingId(null);
    }
  }, [routerId, customerMap, setCustomerMap, router]);

  const handleBayar = useCallback(async (p: Pelanggan) => {
    try {
      const list = await CustomerApi.getAll({ router_id: routerId });
      const found = list.find((c) => c.mikrotik_ref === p.id);
      if (found) {
        setPayingCustomer(found);
      } else {
        const result = await SweetAlert.confirm(
          "Pelanggan belum terdaftar",
          `${p.comment || p.name || p.id} belum ada di daftar pelanggan. Import sekarang?`,
        );
        if (!result.isConfirmed) return;
        const imported = await CustomerApi.import(routerId, [{
          name: p.comment || p.name || p.id,
          type: p.type as "PPPOE" | "DHCP" | "STATIC",
          mikrotik_ref: p.id,
        }]);
        if (imported.created > 0) {
          const updated = await CustomerApi.getAll({ router_id: routerId });
          const newCustomer = updated.find((c) => c.mikrotik_ref === p.id);
          if (newCustomer) setPayingCustomer(newCustomer);
        }
      }
    } catch {
      // silently ignore
    }
  }, [routerId]);

  return {
    kelolaLoadingId,
    handleKelola,
    handleBayar,
  };
}
