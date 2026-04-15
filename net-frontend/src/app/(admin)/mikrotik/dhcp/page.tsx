"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { DHCPTableComponent } from "@/components/mikrotik/dhcp/DHCPTableComponent";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { useAuth } from "@/context/AuthContext";
import { FiServer, FiDatabase } from "react-icons/fi";

const DHCPPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [routers, setRouters] = React.useState<MikrotikRouter[]>([]);
  const [selectedRouterId, setSelectedRouterId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  const activeRouters = routers.filter((r) => r.is_active);

  React.useEffect(() => {
    const fetchRouters = async () => {
      try {
        const data = await MikrotikApi.findAll();
        setRouters(data);

        // Auto-select first active router
        const activeRouters = data.filter((r) => r.is_active);
        if (activeRouters.length > 0) {
          setSelectedRouterId(activeRouters[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch routers:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchRouters();
    }
  }, [user]);

  const selectedRouter = routers.find((r) => r.id === selectedRouterId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Manajemen DHCP Leases
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Kelola DHCP leases untuk monitoring dan manajemen klien
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/mikrotik/dhcp/paket")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
          >
            <FiServer className="h-4 w-4" />
            Kelola Paket
          </button>
          <button
            onClick={() => router.push("/mikrotik/dhcp/pool")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
          >
            <FiDatabase className="h-4 w-4" />
            Kelola Pool
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Pilih Router
        </label>
        {activeRouters.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300">
            Tidak ada router aktif. Silakan aktifkan router di halaman manajemen router.
          </div>
        ) : (
          <select
            value={selectedRouterId || ""}
            onChange={(e) => setSelectedRouterId(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {activeRouters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.host}:{r.port})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedRouterId && selectedRouter ? (
        <DHCPTableComponent routerId={selectedRouterId} routerName={selectedRouter.name} />
      ) : activeRouters.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-800 dark:bg-gray-800/50">
          <p className="text-gray-500 dark:text-gray-400">
            Silakan pilih router aktif untuk melihat DHCP leases
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default DHCPPage;
