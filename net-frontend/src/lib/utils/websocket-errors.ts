export type WebSocketErrorType =
  | "none"
  | "connecting"
  | "auth_failed"
  | "no_routers"
  | "router_inactive"
  | "router_unreachable"
  | "monitor_failed"
  | "redis_failed"
  | "network_error";

export interface WebSocketErrorState {
  errorType: WebSocketErrorType;
  isConnected: boolean;
  routerId?: number;
  routerName?: string;
  lastError?: string;
  diagnosticInfo?: {
    activeRoutersCount: number;
    reachableRoutersCount: number;
    lastDataReceived?: string;
    bufferUsage?: number;
  };
}

export interface WebSocketErrorDisplay {
  title: string;
  description: string;
  action?: string;
  actionUrl?: string;
}

export function classifyWebSocketError(
  error: string | null,
  isConnected: boolean,
  isAuthenticated: boolean,
  routerId?: number
): WebSocketErrorType {
  if (!error) return "none";
  
  if (error.includes("Session not found") || 
      error.includes("Authentication token not found") ||
      error.includes("Silakan login kembali") ||
      error.includes("Session not found. Silakan login kembali") ||
      error.includes("login")) {
    return "auth_failed";
  }
  
  if (error.includes("no routers") || error.includes("tidak ada router")) {
    return "no_routers";
  }
  
  if (error.includes("router inactive") || error.includes("tidak aktif")) {
    return "router_inactive";
  }
  
  if (error.includes("router unreachable") || error.includes("tidak dapat dijangkau")) {
    return "router_unreachable";
  }
  
  if (error.includes("monitor not collecting") || error.includes("monitor tidak mengumpulkan data")) {
    return "monitor_failed";
  }
  
  if (error.includes("redis not receiving") || error.includes("redis tidak menerima data")) {
    return "redis_failed";
  }
  
  if (error.includes("network error") || error.includes("error jaringan") || error.includes("Gagal terhubung")) {
    return "network_error";
  }
  
  return "network_error";
}

export function getWebSocketErrorDisplay(
  errorType: WebSocketErrorType,
  routerId?: number,
  routerName?: string
): WebSocketErrorDisplay {
  const errorMap: Record<WebSocketErrorType, WebSocketErrorDisplay> = {
    none: {
      title: "Terhubung",
      description: "WebSocket terhubung dan siap menerima data.",
    },
    connecting: {
      title: "Menghubungkan...",
      description: "Mencoba menghubungkan ke server WebSocket...",
    },
    auth_failed: {
      title: "Gagal Autentikasi",
      description: "Sesi berakhir atau tidak valid. Silakan login kembali.",
      action: "Login",
      actionUrl: "/auth",
    },
    no_routers: {
      title: "Tidak Ada Router Dikonfigurasi",
      description: "Sistem belum memiliki router yang dikonfigurasi. Tambahkan router untuk mulai monitoring.",
      action: "Tambah Router",
      actionUrl: "/mikrotik",
    },
    router_inactive: {
      title: "Router Tidak Aktif",
      description: `Router "${routerName}" (ID: ${routerId}) tidak aktif. Aktifkan router untuk mulai monitoring.`,
      action: "Aktifkan Router",
    },
    router_unreachable: {
      title: "Router Tidak Dapat Dijangkau",
      description: `Router "${routerName}" (ID: ${routerId}) tidak dapat dijangkau. Periksa konektivitas jaringan dan status router.`,
    },
    monitor_failed: {
      title: "Monitor Gagal Mengumpulkan Data",
      description: `Monitor tidak dapat mengumpulkan data dari router "${routerName}" (ID: ${routerId}). Periksa log backend untuk detail.`,
    },
    redis_failed: {
      title: "Redis Gagal Menerima Data",
      description: `Redis tidak menerima data dari monitor. Periksa koneksi Redis dan status backend.`,
    },
    network_error: {
      title: "Gagal Koneksi Jaringan",
      description: "Gagal terhubung ke server WebSocket. Periksa koneksi internet dan status backend server.",
    },
  };

  return errorMap[errorType] || errorMap.network_error;
}
