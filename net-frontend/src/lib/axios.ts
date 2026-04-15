import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30000,
  transformResponse: [
    (data) => {
      if (!data || (typeof data === "string" && data.trim() === "")) return null;
      if (typeof data !== "string") return data;
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    },
  ],
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Unknown error";
  }

  if (error.response?.data) {
    const d = error.response.data as Record<string, unknown>;
    const msg = d.message ?? d.Message ?? d.error;
    if (typeof msg === "string" && msg) return msg;
  }

  if (error.code === "ECONNABORTED") return "Request timeout";
  if (error.code === "ERR_NETWORK")  return "Network error";

  return error.message || "Unknown error";
}

function isSilencedError(status: number | undefined, url: string): boolean {
  if (status === 429) return true; // Silence rate limiting console errors globally
  if (status === 401 && url.includes("/v1/profile")) return true;
  if (status === 400 && url.includes("/dhcp")) return true;
  if (status === 404) {
    const silencedPaths = [
      "/pppoe/sessions",
      "/interfaces",
      "/resources",
      "/pppoe/disconnect",
      "/pppoe/by-name/",
    ];
    return silencedPaths.some((path) => url.includes(path));
  }
  // Silence GenieACS device errors — handled gracefully in UI
  if (url.includes("/genieacs/devices/")) return true;
  // Silence sync errors — handled gracefully in UI
  if (url.includes("/sync/")) return true;
  // Silence 409 Conflict for PPPoE profiles - handled gracefully by UI
  if (status === 409 && url.includes("/pppoe/profiles")) return true;
  return false;
}

// ─── Interceptor ────────────────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      console.error("[Unknown Error]", {
        message: error instanceof Error ? error.message : "Unknown error",
        error,
      });
      return Promise.reject(error);
    }

    const status  = error.response?.status;
    const url     = error.config?.url ?? "";
    const method  = error.config?.method?.toUpperCase() ?? "UNKNOWN";
    const message = resolveErrorMessage(error);

    // Redirect to /auth on unexpected 401
    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !url.includes("/v1/profile") &&
      window.location.pathname !== "/auth"
    ) {
      window.location.href = "/auth";
    }

    if (!isSilencedError(status, url)) {
      if (status !== undefined && status >= 500) {
        console.error(`[API] Server error — ${method} ${url} (${status}): ${message}`);
        if (process.env.NODE_ENV === "development") {
          console.debug("[DEBUG] Full error response:", error.response?.data);
        }
      } else {
        console.error(`[API] ${method} ${url} (${status ?? "no status"}): ${message}`);
      }
    }

    // Attach metadata for component-level handling
    if (error.response) {
      (error as any).handled     = false;
      (error as any).statusCode  = status;
      (error as any).serverMessage = message;
    }

    // Normalise network errors (no response)
    if (!error.response) {
      error.message = message;
    }

    return Promise.reject(error);
  },
);
