import { useEffect, useRef, useState } from 'react';

interface UseWebSocketOptions {
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const { enabled = true, onMessage, onError, onConnect, onDisconnect } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const enabledRef = useRef(enabled);
  const urlRef = useRef(url);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 5000;
  const MAX_RECONNECT_DELAY = 30000; // Cap at 30s

  useEffect(() => {
    enabledRef.current = enabled;
    urlRef.current = url;
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
  }, [enabled, url, onMessage, onError, onConnect, onDisconnect]);

  useEffect(() => {
    const connect = (): void => {
      try {
        wsRef.current = new WebSocket(urlRef.current);

        wsRef.current.onopen = () => {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
          onConnectRef.current?.();
        };

        wsRef.current.onmessage = (event) => {
          // Validasi data kosong sebelum parse
          if (!event.data || typeof event.data !== 'string' || event.data.trim() === '') {
            return;
          }
          try {
            const data = JSON.parse(event.data);
            setLastMessage(data);
            onMessageRef.current?.(data);
          } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[WS] Failed to parse message:', error);
            }
          }
        };

        wsRef.current.onerror = (error) => {
          onErrorRef.current?.(error);
        };

        wsRef.current.onclose = () => {
          setIsConnected(false);
          onDisconnectRef.current?.();

          if (enabledRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = Math.min(
              RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
              MAX_RECONNECT_DELAY
            );
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          }
        };
       } catch (error) {
        onErrorRef.current?.(error as any);
      }
    };

    const disconnect = (): void => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };

    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled]);

  const send = (data: any): void => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return {
    isConnected,
    lastMessage,
    send,
  };
}