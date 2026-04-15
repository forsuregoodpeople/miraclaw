import axios from "axios";

// Proxied through Next.js API route — secret stays server-side
const waApi = axios.create({
  baseURL: "/api/wa",
  timeout: 30000,
});

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface WASession {
  id: number;
  mitra_id: number;
  session_name: string;
  status: "disconnected" | "connecting" | "connected" | "banned";
  last_seen_at: string | null;
  created_at: string;
}

export interface QueueItem {
  id: number;
  mitra_id: number;
  customer_id: number | null;
  invoice_id: number | null;
  wa_number: string;
  message: string;
  trigger_type: "H-3" | "H-1" | "H0" | "OVERDUE" | "MANUAL";
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  retry_count: number;
  scheduled_at: string;
  sent_at: string | null;
  error_msg: string | null;
  created_at: string;
}

export interface WASettings {
  enabled: boolean;
  rate_limit_per_min: number;
  base_delay_seconds: number;
  jitter_seconds: number;
  max_retry: number;
  stop_on_fail_count: number;
  templates: {
    "H-3": string;
    "H-1": string;
    "H0": string;
    "OVERDUE": string;
  };
}

export interface UpdateSettingsRequest {
  enabled?: boolean;
  rate_limit_per_min?: number;
  base_delay_seconds?: number;
  jitter_seconds?: number;
  max_retry?: number;
  stop_on_fail_count?: number;
  templates?: Partial<WASettings["templates"]>;
}

export interface QueueFilter {
  mitra_id?: number;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface EnqueueRequest {
  mitra_id: number;
  wa_number: string;
  message: string;
  customer_id?: number;
  invoice_id?: number;
}

export interface SendRequest {
  mitra_id: number;
  wa_number: string;
  message: string;
}

// ── API methods ───────────────────────────────────────────────────────────────

export const WhatsAppApi = {
  // Sessions
  getSessions: async (): Promise<WASession[]> => {
    const res = await waApi.get<{ data: WASession[] }>("/sessions");
    return res.data.data ?? [];
  },

  startSession: async (mitraId: number): Promise<void> => {
    await waApi.post(`/sessions/${mitraId}`);
  },

  getSessionStatus: async (mitraId: number): Promise<WASession["status"]> => {
    const res = await waApi.get<{ status: WASession["status"] }>(`/sessions/${mitraId}/status`);
    return res.data.status;
  },

  getQR: async (mitraId: number): Promise<string | null> => {
    try {
      const res = await waApi.get<{ qr: string }>(`/sessions/${mitraId}/qr`);
      return res.data.qr ?? null;
    } catch {
      return null;
    }
  },

  logout: async (mitraId: number): Promise<void> => {
    await waApi.delete(`/sessions/${mitraId}`);
  },

  // Queue
  getQueue: async (filter: QueueFilter = {}): Promise<QueueItem[]> => {
    const res = await waApi.get<{ data: QueueItem[] }>("/queue", { params: filter });
    return res.data.data ?? [];
  },

  enqueueManual: async (data: EnqueueRequest): Promise<QueueItem> => {
    const res = await waApi.post<{ data: QueueItem }>("/queue", data);
    return res.data.data;
  },

  retryItem: async (id: number): Promise<void> => {
    await waApi.post(`/queue/${id}/retry`);
  },

  // Settings
  getSettings: async (mitraId: number): Promise<WASettings> => {
    const res = await waApi.get<{ data: WASettings }>(`/settings/${mitraId}`);
    return res.data.data;
  },

  saveSettings: async (mitraId: number, data: UpdateSettingsRequest): Promise<WASettings> => {
    const res = await waApi.put<{ data: WASettings }>(`/settings/${mitraId}`, data);
    return res.data.data;
  },

  // Direct send (bypasses queue)
  send: async (data: SendRequest): Promise<void> => {
    await waApi.post("/send", data);
  },
};
