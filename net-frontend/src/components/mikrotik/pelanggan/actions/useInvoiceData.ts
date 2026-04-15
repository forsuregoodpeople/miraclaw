"use client";

import { useState, useEffect } from "react";
import { FinanceApi, Invoice } from "@/lib/api/finance";

interface UseInvoiceDataProps {
  routerId: number;
  billingPeriod?: string;
}

interface UseInvoiceDataReturn {
  invoiceMap: Map<number, Invoice>;
  billingPeriod: string;
}

export function useInvoiceData({
  routerId,
  billingPeriod: customPeriod,
}: UseInvoiceDataProps): UseInvoiceDataReturn {
  const [invoiceMap, setInvoiceMap] = useState<Map<number, Invoice>>(new Map());
  const billingPeriod = customPeriod ?? new Date().toISOString().slice(0, 7);

  useEffect(() => {
    if (!routerId) return;
    FinanceApi.getInvoices({ period: billingPeriod })
      .then((list) => {
        const map = new Map<number, Invoice>();
        list.forEach((inv) => { if (inv.customer_id) map.set(inv.customer_id, inv); });
        setInvoiceMap(map);
      })
      .catch(() => {});
  }, [routerId, billingPeriod]);

  return {
    invoiceMap,
    billingPeriod,
  };
}
