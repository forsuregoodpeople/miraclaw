import { useState, useEffect, useCallback } from "react";
import { PackageApi, Package } from "@/lib/api/packages";

interface UsePackagesOptions {
  routerId?: number;
  type?: "PPPOE" | "DHCP" | "STATIC";
  enabled?: boolean;
}

export function usePackages({ routerId, type, enabled = true }: UsePackagesOptions = {}) {
  const [data, setData] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const packages = await PackageApi.getAll({
        router_id: routerId,
        type,
      });
      setData(packages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat paket");
    } finally {
      setIsLoading(false);
    }
  }, [routerId, type, enabled]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return { data, isLoading, error, refetch: fetchPackages };
}
