"use client";

import { useState, useCallback, useEffect } from "react";
import {
  FinanceApi,
  Payment,
  Invoice,
  FinanceSummary,
  Tariff,
  CreatePaymentRequest,
  CreateInvoiceRequest,
  BulkCreateInvoiceRequest,
  BulkCreateInvoiceResult,
  UpdatePaymentRequest,
  UpdateInvoiceRequest,
} from "@/lib/api/finance";

// ─── usePayments ──────────────────────────────────────────────────────────────

interface UsePaymentsReturn {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  createPayment: (data: CreatePaymentRequest) => Promise<Payment>;
  updatePayment: (id: number, data: UpdatePaymentRequest) => Promise<Payment>;
  deletePayment: (id: number) => Promise<void>;
}

export function usePayments(period?: string): UsePaymentsReturn {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await FinanceApi.getPayments(period);
        setPayments(data);
        setError(null);
      } catch {
        setError("Gagal memuat data pembayaran");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPayment = useCallback(
    async (data: CreatePaymentRequest) => {
      const result = await FinanceApi.createPayment(data);
      await refresh(true);
      return result;
    },
    [refresh]
  );

  const updatePayment = useCallback(
    async (id: number, data: UpdatePaymentRequest) => {
      const updated = await FinanceApi.updatePayment(id, data);
      setPayments((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    [refresh]
  );

  const deletePayment = useCallback(
    async (id: number) => {
      const snapshot = await FinanceApi.getPayments(period).catch(() => null);
      try {
        await FinanceApi.deletePayment(id);
        setPayments((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        if (snapshot) setPayments(snapshot);
        throw err;
      }
    },
    [refresh, period]
  );

  return { payments, loading, error, refresh, createPayment, updatePayment, deletePayment };
}

// ─── useInvoices ──────────────────────────────────────────────────────────────

interface UseInvoicesReturn {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  createInvoice: (data: CreateInvoiceRequest) => Promise<Invoice>;
  createBulkInvoices: (data: BulkCreateInvoiceRequest) => Promise<BulkCreateInvoiceResult>;
  updateInvoice: (id: number, data: UpdateInvoiceRequest) => Promise<Invoice>;
}

export function useInvoices(period?: string, customerID?: number): UseInvoicesReturn {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await FinanceApi.getInvoices({
          ...(period ? { period } : {}),
          ...(customerID ? { customer_id: customerID } : {}),
        });
        setInvoices(data);
        setError(null);
      } catch {
        setError("Gagal memuat data tagihan");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [period, customerID]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createInvoice = useCallback(
    async (data: CreateInvoiceRequest) => {
      const result = await FinanceApi.createInvoice(data);
      await refresh(true);
      return result;
    },
    [refresh]
  );

  const createBulkInvoices = useCallback(
    async (data: BulkCreateInvoiceRequest) => {
      const result = await FinanceApi.createBulkInvoices(data);
      await refresh(true);
      return result;
    },
    [refresh]
  );

  const updateInvoice = useCallback(
    async (id: number, data: UpdateInvoiceRequest) => {
      const updated = await FinanceApi.updateInvoice(id, data);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
      return updated;
    },
    [refresh]
  );

  return { invoices, loading, error, refresh, createInvoice, createBulkInvoices, updateInvoice };
}

// ─── useFinanceSummary ────────────────────────────────────────────────────────

interface UseFinanceSummaryReturn {
  summary: FinanceSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFinanceSummary(period: string): UseFinanceSummaryReturn {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await FinanceApi.getSummary(period);
      setSummary(data);
      setError(null);
    } catch {
      setError("Gagal memuat ringkasan keuangan");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
}

// ─── useTariff ────────────────────────────────────────────────────────────────

interface UseTariffReturn {
  tariff: Tariff | null;
  loading: boolean;
  upsert: (customerId: number, monthlyFee: number) => Promise<Tariff>;
}

export function useTariff(customerId: number | null): UseTariffReturn {
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setTariff(null);
      return;
    }
    setLoading(true);
    FinanceApi.getTariff(customerId)
      .then(setTariff)
      .catch(() => setTariff(null))
      .finally(() => setLoading(false));
  }, [customerId]);

  const upsert = useCallback(async (cid: number, fee: number) => {
    const t = await FinanceApi.upsertTariff(cid, fee);
    setTariff(t);
    return t;
  }, []);

  return { tariff, loading, upsert };
}
