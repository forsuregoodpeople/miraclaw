"use client";

import { useState, useEffect, useCallback } from "react";
import { OpticalApi } from "@/lib/api/genieacs";
import type { GenieACSDevice } from "@/types/optical.types";

interface UseGenieACSDevicesReturn {
  devices: GenieACSDevice[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useGenieACSDevices(): UseGenieACSDevicesReturn {
  const [devices, setDevices] = useState<GenieACSDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await OpticalApi.listGenieACSDevices();
      setDevices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data GenieACS");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { devices, loading, error, reload: load };
}
