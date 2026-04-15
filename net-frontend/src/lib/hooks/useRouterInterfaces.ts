import { useState, useEffect, useCallback } from "react";
import { InterfaceData, MikrotikApi } from "@/lib/api/mikrotik";

interface UseRouterInterfacesOptions {
  routerId: number;
  enabled?: boolean;
}

interface UseRouterInterfacesReturn {
  data: InterfaceData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRouterInterfaces({
  routerId,
  enabled = true,
}: UseRouterInterfacesOptions): UseRouterInterfacesReturn {
  const [data, setData] = useState<InterfaceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInterfaces = useCallback(async () => {
    if (!enabled || routerId <= 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const interfaces = await MikrotikApi.getInterfaces(routerId);
      setData(interfaces ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar interface");
    } finally {
      setIsLoading(false);
    }
  }, [routerId, enabled]);

  useEffect(() => {
    fetchInterfaces();
  }, [fetchInterfaces]);

  const refetch = useCallback(async () => {
    await fetchInterfaces();
  }, [fetchInterfaces]);

  return { data, isLoading, error, refetch };
}
