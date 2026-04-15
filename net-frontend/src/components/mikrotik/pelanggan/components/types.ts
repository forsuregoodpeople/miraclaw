import { Pelanggan } from "@/lib/api/pelanggan";
import { Customer } from "@/lib/api/customer";
import { Invoice } from "@/lib/api/finance";

export type Tab = "ALL" | "DHCP" | "PPPOE" | "STATIC";
export type StatusFilter = "all" | "up" | "down" | "isolir";
export type ProfileFilter = "all" | "incomplete" | "no_comment" | "has_wa";
export type SortBy = "default" | "name_asc" | "name_desc" | "ip_asc" | "ip_desc" | "last_seen_asc";

export interface RowProps {
  p: Pelanggan;
  index: number;
  startIndex: number;
  loadingId: boolean;
  customer: Customer | undefined;
  kelolaLoading: boolean;
  onIsolir: (p: Pelanggan) => void;
  onUnIsolir: (p: Pelanggan) => void;
  onBlock: (p: Pelanggan) => void;
  onBayar: (p: Pelanggan) => void;
  invoice: Invoice | undefined;
  onKelola: (p: Pelanggan) => void;
}

export interface TableCounts {
  ALL: number;
  DHCP: number;
  PPPOE: number;
  STATIC: number;
}

export const PAGE_SIZES = [50, 100, 250, 500, 1000];

export const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "DHCP", label: "DHCP" },
  { key: "PPPOE", label: "PPPoE" },
  { key: "STATIC", label: "Static" },
];
