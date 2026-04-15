"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Pelanggan } from "@/lib/api/pelanggan";
import { Customer } from "@/lib/api/customer";
import { Tab, StatusFilter, ProfileFilter, SortBy } from "../components/types";

interface UsePelangganFiltersProps {
  data: Pelanggan[];
  customerMap: Map<string, Customer>;
}

interface UsePelangganFiltersReturn {
  // Filter states
  activeTab: Tab;
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  statusFilter: StatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilter>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  ipFilter: string;
  setIpFilter: React.Dispatch<React.SetStateAction<string>>;
  macFilter: string;
  setMacFilter: React.Dispatch<React.SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  profileFilter: ProfileFilter;
  setProfileFilter: React.Dispatch<React.SetStateAction<ProfileFilter>>;
  
  // Pagination states
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  itemsPerPage: number;
  setItemsPerPage: React.Dispatch<React.SetStateAction<number>>;
  
  // Computed values
  filtered: Pelanggan[];
  paginated: Pelanggan[];
  totalPages: number;
  startIndex: number;
  hasFilter: boolean;
  visiblePages: (number | string)[];
  
  // Counts
  counts: {
    ALL: number;
    DHCP: number;
    PPPOE: number;
    STATIC: number;
  };
  upCount: number;
  downCount: number;
  isolirCount: number;
  
  // Actions
  resetFilters: () => void;
}

export function usePelangganFilters({
  data,
  customerMap,
}: UsePelangganFiltersProps): UsePelangganFiltersReturn {
  const [activeTab, setActiveTab] = useState<Tab>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [macFilter, setMacFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");

  // Reset page on filter/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, statusFilter, profileFilter, searchQuery, ipFilter, macFilter, sortBy]);

  // Reset sort "paling lama terputus" saat filter bukan DOWN
  useEffect(() => {
    if (statusFilter !== "down" && sortBy === "last_seen_asc") {
      setSortBy("default");
    }
  }, [statusFilter]);

  // Counts
  const counts = useMemo(() => ({
    ALL:    data.length,
    DHCP:   data.filter((p) => p.type === "DHCP").length,
    PPPOE:  data.filter((p) => p.type === "PPPOE").length,
    STATIC: data.filter((p) => p.type === "STATIC").length,
  }), [data]);

  const upCount     = useMemo(() => data.filter((p) => p.status === "UP" && !p.is_isolir).length, [data]);
  const downCount   = useMemo(() => data.filter((p) => p.status === "DOWN" && !p.is_isolir).length, [data]);
  const isolirCount = useMemo(() => data.filter((p) => p.is_isolir).length, [data]);

  // Filter + Sort logic
  const filtered = useMemo(() => {
    let result = data;

    if (activeTab !== "ALL") result = result.filter((p) => p.type === activeTab);

    if (statusFilter === "isolir") result = result.filter((p) => p.is_isolir);
    else if (statusFilter === "up")   result = result.filter((p) => p.status === "UP" && !p.is_isolir);
    else if (statusFilter === "down") result = result.filter((p) => p.status === "DOWN" && !p.is_isolir);

    if (profileFilter === "incomplete") {
      result = result.filter((p) => {
        const c = customerMap.get(p.id);
        return c !== undefined && !c.wa_number;
      });
    } else if (profileFilter === "no_comment") {
      result = result.filter((p) => !p.comment || p.comment.trim() === "");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) =>
        p.comment.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.ip.toLowerCase().includes(q) ||
        p.mac.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q)
      );
    }

    if (ipFilter.trim()) {
      const q = ipFilter.trim().toLowerCase();
      result = result.filter((p) => p.ip.toLowerCase().startsWith(q));
    }

    if (macFilter.trim()) {
      const q = macFilter.trim().toLowerCase();
      result = result.filter((p) => p.mac.toLowerCase().startsWith(q));
    }

    if (sortBy === "name_asc")      result = [...result].sort((a, b) => (a.comment || a.name).localeCompare(b.comment || b.name));
    if (sortBy === "name_desc")     result = [...result].sort((a, b) => (b.comment || b.name).localeCompare(a.comment || a.name));
    if (sortBy === "ip_asc")        result = [...result].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
    if (sortBy === "ip_desc")       result = [...result].sort((a, b) => b.ip.localeCompare(a.ip, undefined, { numeric: true }));
    if (sortBy === "last_seen_asc") result = [...result].sort((a, b) => {
      const ta = a.last_seen ? new Date(a.last_seen).getTime() : Infinity;
      const tb = b.last_seen ? new Date(b.last_seen).getTime() : Infinity;
      return ta - tb;
    });

    return result;
  }, [data, activeTab, statusFilter, profileFilter, searchQuery, ipFilter, macFilter, sortBy, customerMap]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex  = (currentPage - 1) * itemsPerPage;
  const paginated   = filtered.slice(startIndex, startIndex + itemsPerPage);

  const hasFilter = activeTab !== "ALL" || statusFilter !== "all" || profileFilter !== "all" || !!searchQuery || !!ipFilter || !!macFilter || sortBy !== "default";

  // Pagination numbers
  const visiblePages = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const resetFilters = useCallback(() => {
    setActiveTab("ALL");
    setStatusFilter("all");
    setProfileFilter("all");
    setSearchQuery("");
    setIpFilter("");
    setMacFilter("");
    setSortBy("default");
    setCurrentPage(1);
  }, []);

  return {
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    ipFilter,
    setIpFilter,
    macFilter,
    setMacFilter,
    sortBy,
    setSortBy,
    profileFilter,
    setProfileFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    filtered,
    paginated,
    totalPages,
    startIndex,
    hasFilter,
    visiblePages,
    counts,
    upCount,
    downCount,
    isolirCount,
    resetFilters,
  };
}
