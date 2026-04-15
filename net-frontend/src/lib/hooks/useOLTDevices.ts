"use client";

import { useState, useEffect, useCallback } from "react";
import { OpticalApi } from "@/lib/api/genieacs";
import type { OpticalDevice } from "@/types/optical.types";

interface UseOLTDevicesReturn {
  devices: OpticalDevice[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useOLTDevices(): UseOLTDevicesReturn {
  const [devices, setDevices] = useState<OpticalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await OpticalApi.listOLT();
      setDevices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data OLT");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { devices, loading, error, reload: load };
}
