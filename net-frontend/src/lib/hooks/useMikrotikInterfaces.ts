"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { InterfaceData, MikrotikApi } from "../api/mikrotik";
import { useAuth } from "@/context/AuthContext";
import { buildWebSocketUrl } from "@/lib/utils/websocket-url";

interface UseMikrotikInterfacesOptions {
  routerId: number;
  enabled?: boolean;
  onMessage?: (data: InterfaceData[]) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseMikrotikInterfacesReturn {
  data: InterfaceData[] | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => void;
  patchInterface: (name: string, patch: Partial<InterfaceData>) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const CONNECTION_TIMEOUT = 15000;

export function useMikrotikInterfaces({
  routerId,
  enabled = true,
  onMessage,
  onError,
  onConnect,
  onDisconnect,
}: UseMikrotikInterfacesOptions): UseMikrotikInterfacesReturn {
  const [state, setState] = useState<{
    data: InterfaceData[] | null;
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    lastUpdate: Date | null;
  }>({
    data: null,
    isConnected: false,
    isLoading: false,
    error: null,
    lastUpdate: null,
  });

  const { isAuthenticated, sessionId, isLoading: authLoading } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Generation counter: bump on every router switch so stale callbacks are ignored
  const generationRef = useRef(0);
  const currentRouterIdRef = useRef(routerId);

  const isAuthenticatedRef = useRef(isAuthenticated);
  const sessionIdRef = useRef(sessionId);
  const enabledRef = useRef(enabled);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  // Previous byte counters per interface name for speed calculation
  const prevCountersRef = useRef<Record<string, { rx: string; tx: string; ts: number }>>({});

  // Sync all refs on every render (no deps needed — refs don't cause re-renders)
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    sessionIdRef.current = sessionId;
    enabledRef.current = enabled;
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
  });

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
    if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
  }, []);

  const closeSocket = useCallback((ws: WebSocket | null) => {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "Replaced");
    }
  }, []);

  // Compute rx-bps / tx-bps from cumulative byte counters
  const calculateSpeed = useCallback((data: InterfaceData[]): InterfaceData[] => {
    const now = Date.now();
    return data.map((iface) => {
      const rxStr = iface["rx-byte"] || "0";
      const txStr = iface["tx-byte"] || "0";
      let rxBps = 0;
      let txBps = 0;

      const prev = prevCountersRef.current[iface.name];
      if (prev) {
        const dt = now - prev.ts;
        if (dt >= 200) {
          try {
            const dRx = BigInt(rxStr) - BigInt(prev.rx);
            const dTx = BigInt(txStr) - BigInt(prev.tx);
            if (dRx >= BigInt(0)) rxBps = Number(dRx * BigInt(8) * BigInt(1000) / BigInt(dt));
            if (dTx >= BigInt(0)) txBps = Number(dTx * BigInt(8) * BigInt(1000) / BigInt(dt));
          } catch { /* non-numeric — skip */ }
        }
      }

      // Always save current snapshot so next call can diff
      prevCountersRef.current[iface.name] = { rx: rxStr, tx: txStr, ts: now };

      return { ...iface, "rx-bps": rxBps, "tx-bps": txBps };
    });
  }, []);

  const connect = useCallback((targetRouterId: number) => {
    if (typeof window === "undefined") return;

    if (document.readyState === "loading") {
      reconnectTimerRef.current = setTimeout(() => connect(targetRouterId), 50);
      return;
    }

    const sessionId = sessionIdRef.current;

    if (!isAuthenticatedRef.current || !sessionId) {
      setState(s => ({ ...s, error: "Silakan login untuk mengakses fitur ini.", isLoading: false }));
      return;
    }

    if (wsRef.current) {
      closeSocket(wsRef.current);
      wsRef.current = null;
    }

    // Bump generation — callbacks captured by old socket will be ignored
    const myGeneration = ++generationRef.current;

    setState(s => ({ ...s, error: null, isLoading: s.data === null }));

    const wsUrl = buildWebSocketUrl(`/v1/ws/interfaces/${targetRouterId}?session_id=${encodeURIComponent(sessionId!)}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      if (generationRef.current !== myGeneration) return;
      setState(s => ({ ...s, isLoading: false, error: "Gagal membuat koneksi WebSocket." }));
      return;
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close(1000, "Timeout");
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      if (generationRef.current !== myGeneration) return;
      reconnectAttemptsRef.current = 0;
      setState(s => ({ ...s, isLoading: false, isConnected: true, error: null }));
      onConnectRef.current?.();

      // Application-level heartbeat — keeps the connection alive through
      // NAT/proxies that close idle TCP connections before the server's
      // 45s ping interval fires.
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "ping" }));
        } else {
          if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (generationRef.current !== myGeneration) return;
      // Validasi data kosong sebelum parse
      if (!event.data || typeof event.data !== 'string' || event.data.trim() === '') {
        return;
      }
      try {
        // writePump may batch multiple JSON arrays separated by \n in one frame
        const lines = (event.data as string).split("\n").filter(Boolean);
        let list: InterfaceData[] | null = null;
        for (const line of lines) {
          try {
            const raw = JSON.parse(line);
            // Filter: hanya terima data dari router yang sedang aktif
            if (raw.routerId && raw.routerId !== targetRouterId) {
              continue;
            }
            const parsed: InterfaceData[] | null = Array.isArray(raw)
              ? raw
              : (raw?.type === "interface_update" && Array.isArray(raw.data) ? raw.data : null);
            if (parsed) list = parsed;
          } catch { /* skip malformed lines */ }
        }
        if (list && list.length > 0) {
          const processed = calculateSpeed(list);
          setState(s => ({ ...s, data: processed, lastUpdate: new Date(), isLoading: false }));
          onMessageRef.current?.(processed);
        }
      } catch { /* ignore outer errors */ }
    };

    ws.onerror = (event: Event) => {
      if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      if (generationRef.current !== myGeneration) return;
      setState(s => ({
        ...s,
        isLoading: false,
        error: isAuthenticatedRef.current
          ? "Gagal terhubung ke WebSocket."
          : "Silakan login untuk mengaktifkan update real-time.",
      }));
      onErrorRef.current?.(event);
    };

    ws.onclose = (event) => {
      if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      if (generationRef.current !== myGeneration) return;

      setState(s => ({ ...s, isLoading: false, isConnected: false }));
      onDisconnectRef.current?.();

      const isNormalClose = event.code === 1000 || event.code === 1001;
      if (!enabledRef.current || isNormalClose) return;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttemptsRef.current - 1),
          MAX_RECONNECT_DELAY
        );
        reconnectTimerRef.current = setTimeout(() => connect(targetRouterId), delay);
      } else {
        setState(s => ({ ...s, error: "Gagal terhubung ke server WebSocket setelah beberapa percobaan." }));
      }
    };

    wsRef.current = ws;
  }, [closeSocket, calculateSpeed]);

  useEffect(() => {
    if (authLoading) return;

    if (!enabled || !isAuthenticated || routerId <= 0) {
      clearTimers();
      generationRef.current++;
      closeSocket(wsRef.current);
      wsRef.current = null;
      prevCountersRef.current = {};
      setState({ data: null, isConnected: false, isLoading: false, error: null, lastUpdate: null });
      return;
    }

    // Reset speed counters on router switch to prevent huge spikes
    currentRouterIdRef.current = routerId;
    prevCountersRef.current = {};
    clearTimers();
    reconnectAttemptsRef.current = 0;

    // Clear data sebelum fetch data router baru
    setState(s => ({ ...s, data: null, isLoading: true, error: null }));

    // HTTP-first: pre-populate table before WebSocket connects
    const fetchInitialData = async () => {
      try {
        const initialData = await MikrotikApi.getInterfaces(routerId);
        // Double-check router belum berubah saat data sampai
        if (currentRouterIdRef.current !== routerId) return;
        if (initialData && initialData.length >= 0) {
          const processed = calculateSpeed(initialData);
          setState(s => ({ ...s, data: processed, lastUpdate: new Date(), isLoading: false }));
          onMessageRef.current?.(processed);
        }
      } catch { /* silently fail — WebSocket will hydrate */ }
    };
    fetchInitialData();

    connect(routerId);

    return () => {
      clearTimers();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- bump generation to invalidate stale WS callbacks
      generationRef.current++;
      closeSocket(wsRef.current);
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId, enabled, isAuthenticated, sessionId, authLoading]);

  // Refresh: immediately re-fetch from HTTP — call this after mutations
  const refresh = useCallback(async () => {
    const rid = currentRouterIdRef.current;
    if (rid <= 0 || !isAuthenticatedRef.current) return;
    try {
      const data = await MikrotikApi.getInterfaces(rid);
      if (data && data.length > 0) {
        const processed = calculateSpeed(data);
        setState(s => ({ ...s, data: processed, lastUpdate: new Date() }));
        onMessageRef.current?.(processed);
      }
    } catch { /* ignore */ }
  }, [calculateSpeed]);

  // Optimistically update a single interface in local state (instant UI update)
  const patchInterface = useCallback((name: string, patch: Partial<InterfaceData>) => {
    setState(s => {
      if (!s.data) return s;
      return {
        ...s,
        data: s.data.map(iface =>
          iface.name === name ? { ...iface, ...patch } : iface
        ),
      };
    });
  }, []);

  return { ...state, refresh, patchInterface };
}
