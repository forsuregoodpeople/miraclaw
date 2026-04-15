"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { OpticalApi } from "@/lib/api/genieacs";
import type { OpticalDevice, OpticalStatusUpdate } from "@/types/optical.types";
import { CookieManager } from "@/lib/utils/cookies";
import { buildWebSocketUrl } from "@/lib/utils/websocket-url";

interface UseONUDevicesReturn {
  devices: OpticalDevice[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useONUDevices(): UseONUDevicesReturn {
  const [devices, setDevices] = useState<OpticalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRefs = useRef<Map<number, WebSocket>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await OpticalApi.listONU();
      setDevices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data ONU");
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to WebSocket updates for each ONU
  useEffect(() => {
    if (devices.length === 0) return;

    // Close stale connections
    wsRefs.current.forEach((ws) => ws.close());
    wsRefs.current.clear();

    const sessionId = CookieManager.getSessionId();

    devices.forEach((d) => {
      if (!d.is_active) return;
      const sessionParam = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const url = buildWebSocketUrl(`/v1/ws/optical/${d.id}${sessionParam}`);
      const ws = new WebSocket(url);

      ws.onmessage = (event) => {
        // Validasi data kosong sebelum parse
        if (!event.data || typeof event.data !== 'string' || event.data.trim() === '') {
          return;
        }
        try {
          const msg: OpticalStatusUpdate = JSON.parse(event.data);
          if (msg.type === "optical_status_update" && msg.device_id === d.id) {
            setDevices((prev) =>
              prev.map((dev) =>
                dev.id === msg.device_id
                  ? { ...dev, latest_status: msg.status }
                  : dev
              )
            );
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => ws.close();
      wsRefs.current.set(d.id, ws);
    });

    const currentRefs = wsRefs.current;
    return () => {
      currentRefs.forEach((ws) => ws.close());
      currentRefs.clear();
    };
  }, [devices.length]); // reconnect only when count changes, not on every status update

  useEffect(() => {
    load();
  }, [load]);

  return { devices, loading, error, reload: load };
}
