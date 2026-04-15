"use client";

import { useState, useEffect, useCallback } from "react";
import { TicketApi, Ticket, TimelineEntry, TicketFilters } from "@/lib/api/ticket";

export function useTickets(filters?: TicketFilters) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await TicketApi.getAll(filters);
      setTickets(data);
    } catch {
      setError("Gagal memuat data tiket");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => { load(); }, [load]);

  return { tickets, loading, error, refresh: load };
}

export function useTicket(id: number | null) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [t, tl] = await Promise.all([
        TicketApi.getById(id),
        TicketApi.getTimeline(id),
      ]);
      setTicket(t);
      setTimeline(tl);
    } catch {
      setError("Gagal memuat detail tiket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { ticket, timeline, loading, error, refresh: load };
}
