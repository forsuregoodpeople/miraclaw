"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Pelanggan, PelangganApi } from "@/lib/api/pelanggan";
import { Customer, CustomerApi } from "@/lib/api/customer";
import { useMikrotikDHCP } from "@/lib/hooks/useMikrotikDHCP";
import { useMikrotikPPPOE } from "@/lib/hooks/useMikrotikPPPOE";
import { useMikrotikStatic } from "@/lib/hooks/useMikrotikStatic";

interface UsePelangganDataProps {
  routerId: number;
}

interface UsePelangganDataReturn {
  data: Pelanggan[];
  setData: React.Dispatch<React.SetStateAction<Pelanggan[]>>;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  customerMap: Map<string, Customer>;
  setCustomerMap: React.Dispatch<React.SetStateAction<Map<string, Customer>>>;
  fetchData: (silent?: boolean) => Promise<void>;
  refreshCustomerMap: () => Promise<void>;
  smoothRefresh: () => Promise<void>;
}

export function usePelangganData({ routerId }: UsePelangganDataProps): UsePelangganDataReturn {
  const [data, setData] = useState<Pelanggan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerMap, setCustomerMap] = useState<Map<string, Customer>>(new Map());

  const fetchData = useCallback(async (silent = false) => {
    if (!routerId) return;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const [pelangganList, customerList] = await Promise.all([
        PelangganApi.findAll(routerId),
        CustomerApi.getAll({ router_id: routerId }),
      ]);
      setData(pelangganList);
      const map = new Map<string, Customer>();
      customerList.forEach((c) => { if (c.mikrotik_ref) map.set(c.mikrotik_ref, c); });
      setCustomerMap(map);
    } catch {
      setError("Gagal memuat data pelanggan.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [routerId]);

  const refreshCustomerMap = useCallback(async () => {
    const list = await CustomerApi.getAll({ router_id: routerId });
    const map = new Map<string, Customer>();
    list.forEach((c) => { if (c.mikrotik_ref) map.set(c.mikrotik_ref, c); });
    setCustomerMap(map);
  }, [routerId]);

  const smoothRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchData(true),
        CustomerApi.sync(routerId).catch(() => {}),
      ]);
      await refreshCustomerMap();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [fetchData, routerId, refreshCustomerMap]);

  // Auto-sync sekali saat mount — background, tidak blok UI
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    const timer = setTimeout(async () => {
      try {
        await CustomerApi.sync(routerId);
        const list = await CustomerApi.getAll({ router_id: routerId });
        const map = new Map<string, Customer>();
        list.forEach((c) => { if (c.mikrotik_ref) map.set(c.mikrotik_ref, c); });
        setCustomerMap(map);
      } catch {
        // silent
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [routerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket: refresh pelanggan data when DHCP/PPPoE observer pushes updates
  const wsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSilentRefresh = useCallback(() => {
    if (wsRefreshTimerRef.current) return;
    wsRefreshTimerRef.current = setTimeout(() => {
      wsRefreshTimerRef.current = null;
      fetchData(true);
    }, 1500);
  }, [fetchData]);

  useMikrotikDHCP({ routerId, onMessage: () => triggerSilentRefresh() });
  useMikrotikPPPOE({ routerId, onMessage: () => triggerSilentRefresh() });
  useMikrotikStatic({ routerId, onMessage: () => triggerSilentRefresh() });

  useEffect(() => {
    fetchData();
  }, [routerId, fetchData]);

  return {
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
  };
}
