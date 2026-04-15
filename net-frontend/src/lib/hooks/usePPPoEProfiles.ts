import { useState, useEffect, useCallback } from "react";
import { PPPoEApi, PPPoEProfile } from "@/lib/api/pppoe";

interface UsePPPoEProfilesOptions {
  routerId: number;
  enabled?: boolean;
}

export function usePPPoEProfiles({
  routerId,
  enabled = true,
}: UsePPPoEProfilesOptions) {
  const [data, setData] = useState<PPPoEProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!enabled || routerId <= 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const profiles = await PPPoEApi.getProfiles(routerId);
      setData(profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PPPoE profiles");
    } finally {
      setIsLoading(false);
    }
  }, [routerId, enabled]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const refetch = useCallback(async () => {
    await fetchProfiles();
  }, [fetchProfiles]);

  return { data, isLoading, error, refetch };
}
