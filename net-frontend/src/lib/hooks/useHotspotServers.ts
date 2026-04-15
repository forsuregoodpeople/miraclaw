import { useState, useEffect, useCallback } from "react";
import { StaticApi, HotspotServer } from "@/lib/api/static";

interface UseHotspotServersOptions {
  routerId: number;
  enabled?: boolean;
}

export function useHotspotServers({
  routerId,
  enabled = true,
}: UseHotspotServersOptions) {
  const [data, setData] = useState<HotspotServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    if (!enabled || routerId <= 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const servers = await StaticApi.getHotspotServers(routerId);
      setData(servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch hotspot servers");
    } finally {
      setIsLoading(false);
    }
  }, [routerId, enabled]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const refetch = useCallback(async () => {
    await fetchServers();
  }, [fetchServers]);

  return { data, isLoading, error, refetch };
}
