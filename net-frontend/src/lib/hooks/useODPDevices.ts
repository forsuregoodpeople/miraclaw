"use client";

import { useState, useEffect, useCallback } from "react";
import { OpticalApi } from "@/lib/api/genieacs";
import type { ODPSummary } from "@/types/optical.types";

interface UseODPDevicesReturn {
  odps: ODPSummary[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useODPDevices(): UseODPDevicesReturn {
  const [odps, setOdps] = useState<ODPSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await OpticalApi.listODP();
      setOdps(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data ODP");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { odps, loading, error, reload: load };
}
