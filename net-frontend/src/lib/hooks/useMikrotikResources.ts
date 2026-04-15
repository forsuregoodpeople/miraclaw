"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ResourceData, MikrotikApi } from "../api/mikrotik";
import { useAuth } from "@/context/AuthContext";
import { buildWebSocketUrl } from "@/lib/utils/websocket-url";

interface UseMikrotikResourcesOptions {
  routerId: number;
  enabled?: boolean;
  onMessage?: (data: ResourceData) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseMikrotikResourcesReturn {
  data: ResourceData | null;
  isConnected: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;
const CONNECTION_TIMEOUT = 10000;

export function useMikrotikResources({
  routerId,
  enabled = true,
  onMessage,
  onError,
  onConnect,
  onDisconnect,
}: UseMikrotikResourcesOptions): UseMikrotikResourcesReturn {
  const [data, setData] = useState<ResourceData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const { isAuthenticated, sessionId, isLoading: authLoading } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const currentRouterIdRef = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const disconnectRef = useRef<() => void>(() => {});

  // Stable refs for callbacks — updating these never triggers reconnects
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const sessionIdRef = useRef(sessionId);
  const enabledRef = useRef(enabled);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearDeferTimer = useCallback(() => {
    if (deferTimerRef.current) {
      clearTimeout(deferTimerRef.current);
      deferTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // ─── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearReconnectTimer();
    clearConnectionTimeout();
    clearDeferTimer();
    clearHeartbeat();

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    isConnectingRef.current = false;
    currentRouterIdRef.current = null;
    setIsConnected(false);
  }, [clearReconnectTimer, clearConnectionTimeout, clearDeferTimer, clearHeartbeat]);

  // ─── Core WebSocket logic ──────────────────────────────────────────────────
  const connectCore = useCallback(() => {
    if (
      isConnectingRef.current ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      console.debug("[WS Resources] Already connecting/connected, skipping");
      return;
    }

    const sessionId = sessionIdRef.current;

    if (!enabled || !routerId) {
      console.debug("[WS Resources] Skipped: not enabled or no routerId", {
        enabled,
        routerId,
      });
      return;
    }

    if (!isAuthenticatedRef.current) {
      console.warn("[WS Resources] Cannot connect — not authenticated");
      setError("Silakan login untuk mengakses fitur ini.");
      return;
    }

    if (!sessionId) {
      console.warn("[WS Resources] Authenticated but session ID not yet available");
      setError("Session tidak ditemukan. Silakan login kembali.");
      return;
    }

    isConnectingRef.current = true;
    currentRouterIdRef.current = routerId;

    const wsUrl = buildWebSocketUrl(`/v1/ws/resources/${routerId}?session_id=${encodeURIComponent(sessionId)}`);

    console.log("[WS Resources] Connecting:", {
      routerId,
      deviceType: "mikrotik_resources",
      url: wsUrl,
      sessionLength: sessionId?.length || 0,
      documentReady: typeof window !== "undefined" ? document.readyState : "N/A",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.substring(0, 50) : "N/A",
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);

      console.log("[WS Resources] WebSocket object created", {
        url: wsUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[WS Resources] Failed to create WebSocket:", {
        error: err instanceof Error ? err.message : String(err),
        url: wsUrl.replace(sessionId, sessionId.substring(0, 8) + "..."),
      });
      isConnectingRef.current = false;
      setError("Gagal membuat koneksi WebSocket. Periksa browser Anda.");
      return;
    }

    // Hard timeout: close if we never reach OPEN
    connectionTimeoutRef.current = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CLOSED) {
        console.error("[WS Resources] Connection timed out after", CONNECTION_TIMEOUT, "ms", {
          readyState: ws.readyState,
          routerId,
        });
        try {
          ws.close(1000, "Connection timeout");
        } catch (closeErr) {
          console.error("[WS Resources] Error closing WebSocket on timeout:", closeErr);
        }
      }
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      if (currentRouterIdRef.current !== routerId) {
        console.warn("[WS Resources] Stale connection detected", {
          currentRouter: currentRouterIdRef.current,
          requestedRouter: routerId,
        });
        ws.close();
        return;
      }
      clearConnectionTimeout();
      console.log("[WS Resources] WebSocket connected successfully", {
        routerId,
        readyState: ws.readyState,
        url: ws.url,
        timestamp: new Date().toISOString(),
      });
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      setError(null);
      onConnectRef.current?.();

      // Start application-level heartbeat every 30s to keep connection alive
      // through proxies/NAT that may close idle connections before server ping (45s)
      clearHeartbeat();
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "ping" }));
        } else {
          clearHeartbeat();
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (currentRouterIdRef.current !== routerId) return;

      // Validate message data - periksa string kosong atau whitespace only
      if (!event.data || typeof event.data !== 'string' || event.data.trim() === '') {
        console.warn("[WS Resources] Received empty message");
        return;
      }

      try {
        const message = JSON.parse(event.data);

        // Validate message structure
        if (!message || typeof message !== 'object') {
          console.warn("[WS Resources] Invalid message structure:", typeof message);
          return;
        }

        if (message.type === "resource_update" && message.data) {
          // Filter: hanya terima data dari router yang sedang aktif
          if (message.routerId && message.routerId !== routerId) {
            return;
          }
          const parsedData = message.data as ResourceData;
          setData(parsedData);
          setLastUpdate(new Date());
          onMessageRef.current?.(parsedData);

          console.log("[WS Resources] Resource data received", {
            routerId,
            cpuLoad: parsedData["cpu-load"],
            memory: parsedData["free-memory"],
            hasData: true,
            dataKeys: Object.keys(parsedData).join(", "),
          });
        } else if (message.type === "subscribed") {
          console.debug("[WS Resources] Subscription confirmed", {
            routerId,
            message,
          });
        } else {
          console.debug("[WS Resources] Unknown message format:", {
            type: message.type,
            hasData: !!message.data,
            isArray: Array.isArray(message),
            keys: Object.keys(message),
          });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error("[WS Resources] Failed to parse message:", {
          error: error.message,
          errorName: error.name,
          rawData: event.data.substring(0, 100),
          dataLength: event.data.length,
        });
      }
    };

    ws.onerror = (event) => {
      if (currentRouterIdRef.current !== routerId) return;
      clearConnectionTimeout();

      console.error("[WS Resources] WebSocket connection error", {
        errorCode: (event as any)?.code,
        errorMessage: (event as any)?.message,
        url: ws.url,
        timestamp: new Date().toISOString(),
      });

      const evt = event as any;
      const detail =
        evt?.message || evt?.reason || (evt?.code ? `code: ${evt.code}` : "");

      const errorMsg = isAuthenticatedRef.current
        ? `Gagal terhubung ke WebSocket. Periksa koneksi jaringan atau server backend.${detail ? ` (${detail})` : ""}`
        : "Silakan login untuk mengaktifkan update real-time.";

      setError(errorMsg);
      onErrorRef.current?.(event as Event);
    };

    ws.onclose = (event) => {
      if (currentRouterIdRef.current !== routerId) return;
      clearConnectionTimeout();
      clearHeartbeat();

      const closeReason = event.reason || "No reason provided";
      console.warn("[WS Resources] WebSocket connection closed", {
        routerId,
        code: event.code,
        reason: closeReason,
        wasClean: event.wasClean,
        enabled,
        reconnectAttempts: reconnectAttemptsRef.current,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        timestamp: new Date().toISOString(),
      });

      isConnectingRef.current = false;
      setIsConnected(false);
      onDisconnectRef.current?.();

      const isNormalClose = event.code === 1000 || event.code === 1001;
      if (!isNormalClose && enabledRef.current) {
        console.log("[WS Resources] Scheduling reconnection", {
          attempt: reconnectAttemptsRef.current + 1,
          maxAttempts: MAX_RECONNECT_ATTEMPTS,
        });
        scheduleReconnectRef.current();
      } else {
        console.debug("[WS Resources] Normal close, not reconnecting", {
          code: event.code,
          reason: closeReason,
        });
      }
    };

    wsRef.current = ws;
  }, [routerId, enabled, clearConnectionTimeout, clearHeartbeat]);

  // ─── connect: optimized for faster connection ──────────────
  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    // Clear any pending defer timer
    clearDeferTimer();

    // Defer connection if page is still loading to avoid "interrupted while the page was loading" errors
    const readyState = document.readyState;
    if (readyState === 'loading') {
      console.debug('[WS Resources] Page still loading, deferring connection with short timeout');
      deferTimerRef.current = setTimeout(() => {
        deferTimerRef.current = null;
        connectRef.current?.();
      }, 50);
      return;
    }

    connectCore();
  }, [connectCore, clearDeferTimer]);

  // Keep refs in sync (use refs to prevent re-renders)
  useEffect(() => {
    connectRef.current = connect;
    disconnectRef.current = disconnect;
  }, [connect, disconnect]);

  useEffect(() => {
    scheduleReconnectRef.current = () => {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError(
          isAuthenticatedRef.current
            ? "Gagal terhubung ke server WebSocket setelah beberapa percobaan."
            : "Silakan login untuk mengaktifkan koneksi WebSocket."
        );
        return;
      }

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY *
          Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttemptsRef.current - 1),
        MAX_RECONNECT_DELAY
      );

      console.debug(
        `[WS Resources] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
      );

      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    };
  }, [connect]);

  // ─── Main effect: re-runs only when routerId or enabled changes ────────────
  useEffect(() => {
    console.log("[WS Resources] Hook effect triggered", {
      routerId,
      enabled,
      isAuthenticated,
      authLoading,
    });

    if (!enabled || !routerId) return;

    // Auth not yet resolved — connect() will guard internally via isAuthenticatedRef
    // A separate effect below will trigger connect once auth settles.
    if (authLoading) {
      console.debug("[WS Resources] Waiting for auth to complete");
      return;
    }

    if (!isAuthenticated) {
      console.warn("[WS Resources] Not authenticated, setting error");
      setTimeout(() => setError("Silakan login untuk mengakses fitur ini."), 0);
      return;
    }

    console.log("[WS Resources] All conditions met, calling connect()");

    // Fetch initial data via HTTP for immediate display
    const fetchInitialData = async () => {
      try {
        console.log("[WS Resources] Fetching initial data via HTTP");
        const initialData = await MikrotikApi.getResources(routerId);
        setData(initialData);
        setLastUpdate(new Date());
        console.log("[WS Resources] Initial data fetched successfully");
      } catch (error) {
        console.error("[WS Resources] Failed to fetch initial data:", error);
      }
    };
    fetchInitialData();

    connectRef.current?.();

    return () => {
      console.log("[WS Resources] Cleaning up connection");
      disconnectRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId, enabled]);

  // ─── Auth-settle effect: fires once auth loading finishes ──────────────────
  // Connects when auth+session resolve; disconnects when session expires/logs out.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !sessionId) {
      disconnectRef.current?.();
      return;
    }
    if (!enabled || !routerId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;
    connectRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, sessionId]);

  return { data, isConnected, error, lastUpdate };
}