import { useState, useEffect, useCallback } from "react";
import { DHCPApi, DHCPServer } from "@/lib/api/dhcp";

interface UseDHCPServersOptions {
  routerId: number;
  enabled?: boolean;
}

export function useDHCPServers({
  routerId,
  enabled = true,
}: UseDHCPServersOptions) {
  const [data, setData] = useState<DHCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    if (!enabled || routerId <= 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const servers = await DHCPApi.getServers(routerId);
      setData(servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch DHCP servers");
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
