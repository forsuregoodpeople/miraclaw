import { api } from "@/lib/axios";

export type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketCategory = "INTERNET_DOWN" | "LOS" | "SLOW" | "NO_SIGNAL" | "HARDWARE" | "BILLING" | "OTHER";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Ticket {
  id: number;
  ticket_number: string;
  customer_id?: number;
  customer_name: string;
  mikrotik_ref?: string;
  onu_id?: number;
  router_id?: number;
  location_odp?: string;
  category: TicketCategory;
  priority: TicketPriority;
  title: string;
  description: string;
  status: TicketStatus;
  assigned_to?: number;
  assigned_by?: number;
  assigned_at?: string;
  resolved_at?: string;
  closed_at?: string;
  sla_deadline: string;
  is_overdue: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: number;
  ticket_id: number;
  actor_id: number;
  actor_name: string;
  action: "CREATED" | "STATUS_CHANGED" | "ASSIGNED" | "COMMENT" | "FIELD_UPDATED";
  from_status?: string;
  to_status?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CreateTicketRequest {
  customer_id?: number;
  customer_name?: string;
  mikrotik_ref?: string;
  onu_id?: number;
  router_id?: number;
  location_odp?: string;
  category: TicketCategory;
  priority: TicketPriority;
  title: string;
  description: string;
}

export interface DuplicateCheckResult {
  has_duplicate: boolean;
  tickets: Ticket[];
}

export interface TicketFilters {
  status?: TicketStatus;
  assigned_to?: number;
  category?: TicketCategory;
  overdue?: boolean;
}

export interface UpdateTicketRequest {
  category: TicketCategory;
  priority: TicketPriority;
  title: string;
  description: string;
  location_odp?: string;
}

export const TicketApi = {
  getAll: async (filters?: TicketFilters): Promise<Ticket[]> => {
    const res = await api.get<{ data: Ticket[] }>("/v1/tickets/", { params: filters });
    return res.data.data ?? [];
  },

  getById: async (id: number): Promise<Ticket> => {
    const res = await api.get<{ data: Ticket }>(`/v1/tickets/${id}`);
    return res.data.data;
  },

  create: async (data: CreateTicketRequest): Promise<Ticket> => {
    const res = await api.post<{ data: Ticket }>("/v1/tickets/", data);
    return res.data.data;
  },

  checkDuplicate: async (data: { customer_id?: number; mikrotik_ref?: string }): Promise<DuplicateCheckResult> => {
    const res = await api.post<{ data: DuplicateCheckResult }>("/v1/tickets/check-duplicate", data);
    return res.data.data;
  },

  assign: async (id: number, assignedTo: number): Promise<void> => {
    await api.put(`/v1/tickets/${id}/assign`, { assigned_to: assignedTo });
  },

  updateStatus: async (id: number, status: TicketStatus, comment?: string): Promise<void> => {
    await api.put(`/v1/tickets/${id}/status`, { status, comment: comment ?? "" });
  },

  addComment: async (id: number, comment: string): Promise<void> => {
    await api.post(`/v1/tickets/${id}/comments`, { comment });
  },

  getTimeline: async (id: number): Promise<TimelineEntry[]> => {
    const res = await api.get<{ data: TimelineEntry[] }>(`/v1/tickets/${id}/timeline`);
    return res.data.data ?? [];
  },

  getOverdue: async (): Promise<Ticket[]> => {
    const res = await api.get<{ data: Ticket[] }>("/v1/tickets/overdue");
    return res.data.data ?? [];
  },

  update: async (id: number, data: UpdateTicketRequest): Promise<Ticket> => {
    const res = await api.put<{ data: Ticket }>(`/v1/tickets/${id}`, data);
    return res.data.data;
  },
};
