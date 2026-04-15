"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { StaticBinding, StaticApi } from "@/lib/api/static";
import { buildWebSocketUrl } from "@/lib/utils/websocket-url";

interface UseMikrotikStaticOptions {
  routerId: number;
  enabled?: boolean;
  onMessage?: (data: StaticBinding[]) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseMikrotikStaticReturn {
  data: StaticBinding[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refetch: () => Promise<void>;
  patchBinding: (id: number, patch: Partial<StaticBinding>) => void;
  addBinding: (binding: StaticBinding) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const CONNECTION_TIMEOUT = 15000;

export function useMikrotikStatic({
  routerId,
  enabled = true,
  onMessage,
  onError,
  onConnect,
  onDisconnect,
}: UseMikrotikStaticOptions): UseMikrotikStaticReturn {
  const [state, setState] = useState<{
    data: StaticBinding[];
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    lastUpdate: Date | null;
  }>({
    data: [],
    isConnected: false,
    isLoading: false,
    error: null,
    lastUpdate: null,
  });

  const { isAuthenticated, sessionId, isLoading: authLoading } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const generationRef = useRef(0);
  const currentRouterIdRef = useRef(routerId);

  const isAuthenticatedRef = useRef(isAuthenticated);
  const sessionIdRef = useRef(sessionId);
  const enabledRef = useRef(enabled);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

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
  }, []);

  const closeSocket = useCallback((ws: WebSocket) => {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "Replaced");
    }
  }, []);

  const safeSetState = useCallback((updater: React.SetStateAction<typeof state>) => {
    if (isMountedRef.current) {
      setState(updater);
    }
  }, []);

  const connect = useCallback((targetRouterId: number) => {
    if (typeof window === "undefined") return;

    if (document.readyState === "loading") {
      reconnectTimerRef.current = setTimeout(() => connect(targetRouterId), 50);
      return;
    }

    const sessionId = sessionIdRef.current;

    if (!isAuthenticatedRef.current || !sessionId) {
      safeSetState(s => ({ ...s, error: "Silakan login untuk mengakses fitur ini.", isLoading: false }));
      return;
    }

    if (wsRef.current) {
      closeSocket(wsRef.current);
      wsRef.current = null;
    }

    const myGeneration = ++generationRef.current;

    safeSetState(s => ({
      ...s,
      error: null,
      isLoading: true,
    }));

    const wsUrl = buildWebSocketUrl(`/v1/ws/static/${targetRouterId}?session_id=${encodeURIComponent(sessionId!)}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      if (generationRef.current !== myGeneration) return;
      safeSetState(s => ({ ...s, isLoading: false, error: "Gagal membuat koneksi WebSocket." }));
      return;
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close(1000, "Timeout");
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      clearTimeout(connectionTimeoutRef.current!);
      connectionTimeoutRef.current = null;
      if (generationRef.current !== myGeneration || !isMountedRef.current) return;
      reconnectAttemptsRef.current = 0;
      safeSetState(s => ({ ...s, isLoading: false, isConnected: true, error: null }));
      onConnectRef.current?.();
    };

    ws.onmessage = (event) => {
      if (generationRef.current !== myGeneration || !isMountedRef.current) return;
      // Validasi data kosong sebelum parse
      if (!event.data || typeof event.data !== 'string' || event.data.trim() === '') {
        return;
      }
      try {
        const message = JSON.parse(event.data);
        if (message === null) {
          safeSetState(s => ({ ...s, data: [], isLoading: false, lastUpdate: new Date() }));
          return;
        }
        if (!message || typeof message !== "object") return;

        // Filter: hanya terima data dari router yang sedang aktif
        if (message.routerId && message.routerId !== targetRouterId) {
          return;
        }

        let parsed: StaticBinding[] | null = null;
        if (message.type === "static_update" && Array.isArray(message.data)) {
          parsed = message.data;
        } else if (Array.isArray(message)) {
          parsed = message;
        }

        if (parsed) {
          // Filter: hanya data dengan router_id yang sesuai atau tanpa router_id
          const routerFilteredData = parsed.filter((b: StaticBinding) => 
            !b.router_id || b.router_id === targetRouterId
          );

          const sanitized = routerFilteredData.map((b) => ({
            ...b,
            id:          b.id          || 0,
            address:     b.address     || "",
            mac_address: b.mac_address || "",
            server:      b.server      || "",
            type:        b.type        || "regular",
            to_address:  b.to_address  || "",
            comment:     b.comment     || "",
          })) as StaticBinding[];
          
          // Replace data completely (bukan merge)
          safeSetState(s => ({ 
            ...s, 
            data: sanitized, 
            isLoading: false, 
            lastUpdate: new Date() 
          }));
          onMessageRef.current?.(sanitized);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (event: Event) => {
      clearTimeout(connectionTimeoutRef.current!);
      connectionTimeoutRef.current = null;
      if (generationRef.current !== myGeneration || !isMountedRef.current) return;
      if (typeof window !== "undefined" && (document.hidden || !document.hasFocus())) return;
      safeSetState(s => ({
        ...s,
        isLoading: false,
        error: isAuthenticatedRef.current
          ? "Gagal terhubung ke WebSocket."
          : "Silakan login untuk mengaktifkan update real-time.",
      }));
      onErrorRef.current?.(event);
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeoutRef.current!);
      connectionTimeoutRef.current = null;
      if (generationRef.current !== myGeneration || !isMountedRef.current) return;

      safeSetState(s => ({ ...s, isLoading: false, isConnected: false }));
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
        safeSetState(s => ({
          ...s,
          error: isAuthenticatedRef.current
            ? "Gagal terhubung ke server WebSocket setelah beberapa percobaan."
            : "Silakan login untuk mengaktifkan koneksi WebSocket.",
        }));
      }
    };

    wsRef.current = ws;
  }, [closeSocket, safeSetState]);

  useEffect(() => {
    isMountedRef.current = true;

    if (authLoading) return;

    if (!enabled || !isAuthenticated || routerId <= 0) {
      clearTimers();
      generationRef.current++;
      if (wsRef.current) { closeSocket(wsRef.current); wsRef.current = null; }
      safeSetState({ data: [], isConnected: false, isLoading: false, error: null, lastUpdate: null });
      return;
    }

    currentRouterIdRef.current = routerId;
    clearTimers();
    reconnectAttemptsRef.current = 0;

    // Clear data sebelum fetch data router baru
    safeSetState({ data: [], isConnected: false, isLoading: true, error: null, lastUpdate: null });

    // HTTP-first: ambil data dari REST dulu sebelum WS connect
    const fetchInitialData = async () => {
      if (!isMountedRef.current) return;
      try {
        const initialData = await StaticApi.findAll(routerId);
        // Double-check router belum berubah saat data sampai
        if (currentRouterIdRef.current !== routerId) return;
        if (initialData && initialData.length >= 0) {
          safeSetState(s => ({ ...s, data: initialData, isLoading: false, lastUpdate: new Date() }));
          onMessageRef.current?.(initialData);
        }
      } catch {
        // Silently fail — WebSocket akan hydrate data
      }
    };
    fetchInitialData();

    connect(routerId);

    return () => {
      isMountedRef.current = false;
      clearTimers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++;
      if (wsRef.current) { closeSocket(wsRef.current); wsRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId, enabled, isAuthenticated, sessionId, authLoading, safeSetState]);

  const refetch = useCallback(async () => {
    if (!isMountedRef.current) return;
    const rid = currentRouterIdRef.current;
    if (rid <= 0 || !isAuthenticatedRef.current) return;
    try {
      const data = await StaticApi.findAll(rid);
      if (data) {
        safeSetState(s => ({ ...s, data, lastUpdate: new Date() }));
      }
    } catch {
      // Silently fail
    }
  }, [safeSetState]);

  const patchBinding = useCallback((id: number, patch: Partial<StaticBinding>) => {
    safeSetState(s => {
      if (!s.data || s.data.length === 0) return s;
      return {
        ...s,
        data: s.data.map(b => b.id === id ? { ...b, ...patch } : b),
      };
    });
  }, [safeSetState]);

  // Optimistically prepend a new binding (instant UI update after create)
  const addBinding = useCallback((binding: StaticBinding) => {
    safeSetState(s => ({ ...s, data: [binding, ...(s.data ?? [])] }));
  }, [safeSetState]);

  return { ...state, refetch, patchBinding, addBinding };
}
