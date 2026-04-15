/**
 * Builds a WebSocket URL for the given path + query string.
 *
 * When NEXT_PUBLIC_API_URL is set (e.g. development or explicit config), it is
 * used as the base and the protocol is converted to ws/wss accordingly.
 *
 * When NEXT_PUBLIC_API_URL is empty (Docker proxy mode), HTTP API calls go
 * through the Next.js rewrite proxy, but WebSocket upgrades cannot be proxied.
 * In that case we connect directly to the backend on the same hostname as the
 * page but on the backend port (default 3003, overridable via
 * NEXT_PUBLIC_BACKEND_PORT).
 */
export function buildWebSocketUrl(path: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl) {
    const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
    const host = apiUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `${wsProtocol}://${host}${path}`;
  }

  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "3003";
    return `${wsProtocol}://${window.location.hostname}:${backendPort}${path}`;
  }

  return `ws://localhost:3003${path}`;
}
