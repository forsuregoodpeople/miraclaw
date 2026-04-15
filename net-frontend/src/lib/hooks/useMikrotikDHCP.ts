"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { DHCPLease, DHCPApi } from "@/lib/api/dhcp";
import { buildWebSocketUrl } from "@/lib/utils/websocket-url";

interface UseMikrotikDHCPOptions {
  routerId: number;
  enabled?: boolean;
  onMessage?: (data: DHCPLease[]) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseMikrotikDHCPReturn {
  data: DHCPLease[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refetch: () => Promise<void>;
  patchLease: (id: number, patch: Partial<DHCPLease>) => void;
  addLease: (lease: DHCPLease) => void;
  removeLease: (id: number) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const CONNECTION_TIMEOUT = 15000;

export function useMikrotikDHCP({
  routerId,
  enabled = true,
  onMessage,
  onError,
  onConnect,
  onDisconnect,
}: UseMikrotikDHCPOptions): UseMikrotikDHCPReturn {
  // Single state object — all updates batched in one React render
  const [state, setState] = useState<{
    data: DHCPLease[];
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

  // The "generation" counter — incremented on every router switch.
  // Each connect() captures its own generation; if it changes, all
  // callbacks are ignored → zero stale state updates → zero blink.
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

  // Safe setState wrapper — prevents updates after unmount
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

    // Close any existing socket silently
    if (wsRef.current) {
      closeSocket(wsRef.current);
      wsRef.current = null;
    }

    // Bump generation — all callbacks from old socket will be ignored
    const myGeneration = ++generationRef.current;

    // Only show spinner on first load (no existing data)
    safeSetState(s => ({
      ...s,
      error: null,
      isLoading: s.data.length === 0,
    }));

    const wsUrl = buildWebSocketUrl(`/v1/ws/dhcp/${targetRouterId}?session_id=${encodeURIComponent(sessionId!)}`);

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

        let parsed: DHCPLease[] | null = null;
        if (message.type === "dhcp_update" && Array.isArray(message.data)) {
          parsed = message.data;
        } else if (Array.isArray(message)) {
          parsed = message;
        }

        if (parsed) {
          // Filter: hanya data dengan router_id yang sesuai atau tanpa router_id (real-time dari MikroTik)
          const routerFilteredData = parsed.filter((lease: DHCPLease) => 
            !lease.router_id || lease.router_id === targetRouterId
          );

          const sanitizedData = routerFilteredData.map((lease) => ({
            ...lease,
            address:        lease.address        && lease.address        !== "undefined" ? lease.address        : "",
            mac_address:    lease.mac_address    && lease.mac_address    !== "undefined" ? lease.mac_address    : "",
            host_name:      lease.host_name      && lease.host_name      !== "undefined" ? lease.host_name      : "",
            client_id:      lease.client_id      && lease.client_id      !== "undefined" ? lease.client_id      : "",
            server:         lease.server         && lease.server         !== "undefined" ? lease.server         : "",
            status:         lease.status         && lease.status         !== "undefined" ? lease.status         : "",
            expires_after:  lease.expires_after  && lease.expires_after  !== "undefined" ? lease.expires_after  : "",
            active_address: lease.active_address && lease.active_address !== "undefined" ? lease.active_address : "",
            active_mac:     lease.active_mac     && lease.active_mac     !== "undefined" ? lease.active_mac     : "",
            active_server:  lease.active_server  && lease.active_server  !== "undefined" ? lease.active_server  : "",
            last_seen:      lease.last_seen      && lease.last_seen      !== "undefined" ? lease.last_seen      : "",
            comment:        lease.comment        && lease.comment        !== "undefined" ? lease.comment        : "",
          })) as DHCPLease[];

          // Replace data completely (bukan merge) untuk hindari tercampur antar router
          safeSetState(s => ({ 
            ...s, 
            data: sanitizedData, 
            isLoading: false, 
            lastUpdate: new Date() 
          }));
          onMessageRef.current?.(sanitizedData);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (event: Event) => {
      clearTimeout(connectionTimeoutRef.current!);
      connectionTimeoutRef.current = null;
      if (generationRef.current !== myGeneration || !isMountedRef.current) return;
      if (typeof window !== "undefined" && (document.hidden || !document.hasFocus())) {
        return;
      }
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
      // Full teardown
      clearTimers();
      generationRef.current++;
      if (wsRef.current) { closeSocket(wsRef.current); wsRef.current = null; }
      safeSetState({ data: [], isConnected: false, isLoading: false, error: null, lastUpdate: null });
      return;
    }

    currentRouterIdRef.current = routerId;
    clearTimers();
    reconnectAttemptsRef.current = 0;

    // Clear data sebelum fetch data router baru (hindari data router lama tampil)
    safeSetState(s => ({ ...s, data: [], isLoading: true, error: null }));

    // HTTP-first: fetch cached data immediately before WebSocket connects
    const fetchInitialData = async () => {
      if (!isMountedRef.current) return;
      try {
        const initialData = await DHCPApi.findAll(routerId);
        // Double-check router belum berubah saat data sampai
        if (currentRouterIdRef.current !== routerId) return;
        if (initialData && initialData.length >= 0) {
          safeSetState(s => ({ ...s, data: initialData, isLoading: false, lastUpdate: new Date() }));
          onMessageRef.current?.(initialData);
        }
      } catch {
        // Silently fail — WebSocket will hydrate data
      }
    };
    fetchInitialData();

    connect(routerId);

    return () => {
      // Router switch cleanup: bump generation + close socket silently.
      // Mark as unmounted to prevent further state updates
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
      const data = await DHCPApi.findAll(rid);
      if (data) {
        safeSetState(s => ({ ...s, data, lastUpdate: new Date() }));
      }
    } catch {
      // Silently fail — WebSocket will push new data soon
    }
  }, [safeSetState]);

  // Optimistically update a single lease in local state (instant UI update)
  const patchLease = useCallback((id: number, patch: Partial<DHCPLease>) => {
    safeSetState(s => {
      if (!s.data || s.data.length === 0) return s;
      return {
        ...s,
        data: s.data.map(lease =>
          lease.id === id ? { ...lease, ...patch } : lease
        ),
      };
    });
  }, [safeSetState]);

  // Optimistically prepend a new lease (instant UI update after create)
  const addLease = useCallback((lease: DHCPLease) => {
    safeSetState(s => ({ ...s, data: [lease, ...(s.data ?? [])] }));
  }, [safeSetState]);

  // Optimistically remove a lease by id (instant UI update before delete API call)
  const removeLease = useCallback((id: number) => {
    safeSetState(s => ({
      ...s,
      data: (s.data ?? []).filter(lease => lease.id !== id),
    }));
  }, [safeSetState]);

  return { ...state, refetch, patchLease, addLease, removeLease };
}
