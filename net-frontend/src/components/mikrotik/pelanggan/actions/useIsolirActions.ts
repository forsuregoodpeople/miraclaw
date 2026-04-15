"use client";

import { useState, useCallback } from "react";
import { Pelanggan, PelangganApi } from "@/lib/api/pelanggan";
import { SweetAlert } from "@/lib/sweetalert";

interface UseIsolirActionsProps {
  routerId: number;
  setData: React.Dispatch<React.SetStateAction<Pelanggan[]>>;
}

interface UseIsolirActionsReturn {
  loadingIsolir: Record<string, boolean>;
  handleIsolir: (p: Pelanggan) => Promise<void>;
  handleUnIsolir: (p: Pelanggan) => Promise<void>;
  handleBlock: (p: Pelanggan) => Promise<void>;
}

export function useIsolirActions({
  routerId,
  setData,
}: UseIsolirActionsProps): UseIsolirActionsReturn {
  const [loadingIsolir, setLoadingIsolir] = useState<Record<string, boolean>>({});

  const handleIsolir = useCallback(async (p: Pelanggan) => {
    const confirm = await SweetAlert.confirm(
      "Konfirmasi Isolir",
      `Apakah Anda yakin ingin mengisolir pelanggan ${p.name || p.id}?`
    );
    if (!confirm.isConfirmed) return;

    setLoadingIsolir((prev) => ({ ...prev, [p.id]: true }));
    setData((prev) =>
      prev.map((item) => item.id === p.id ? { ...item, is_isolir: true, status: "DOWN" } : item)
    );
    try {
      await PelangganApi.isolir(routerId, p.type, p.original_id);
      SweetAlert.success("Berhasil", "Pelanggan berhasil diisolir");
    } catch {
      SweetAlert.error("Gagal", "Gagal mengisolir pelanggan");
      setData((prev) =>
        prev.map((item) => item.id === p.id ? { ...item, is_isolir: p.is_isolir, status: p.status } : item)
      );
    } finally {
      setLoadingIsolir((prev) => ({ ...prev, [p.id]: false }));
    }
  }, [routerId, setData]);

  const handleUnIsolir = useCallback(async (p: Pelanggan) => {
    const confirm = await SweetAlert.confirm(
      "Konfirmasi Buka Isolir",
      `Apakah Anda yakin ingin membuka isolir pelanggan ${p.name || p.id}?`
    );
    if (!confirm.isConfirmed) return;

    setLoadingIsolir((prev) => ({ ...prev, [p.id]: true }));
    setData((prev) =>
      prev.map((item) => item.id === p.id ? { ...item, is_isolir: false } : item)
    );
    try {
      await PelangganApi.unIsolir(routerId, p.type, p.original_id);
      SweetAlert.success("Berhasil", "Isolir pelanggan berhasil dibuka");
    } catch {
      SweetAlert.error("Gagal", "Gagal membuka isolir pelanggan");
      setData((prev) =>
        prev.map((item) => item.id === p.id ? { ...item, is_isolir: p.is_isolir } : item)
      );
    } finally {
      setLoadingIsolir((prev) => ({ ...prev, [p.id]: false }));
    }
  }, [routerId, setData]);

  const handleBlock = useCallback(async (p: Pelanggan) => {
    const confirm = await SweetAlert.confirm(
      "Konfirmasi Blokir",
      `Apakah Anda yakin ingin memblokir pelanggan ${p.name || p.id}?`
    );
    if (!confirm.isConfirmed) return;

    setLoadingIsolir((prev) => ({ ...prev, [p.id]: true }));
    setData((prev) =>
      prev.map((item) => item.id === p.id ? { ...item, is_isolir: true, status: "DOWN" } : item)
    );
    try {
      await PelangganApi.block(routerId, p.type, p.original_id);
      SweetAlert.success("Berhasil", "Pelanggan berhasil diblokir");
    } catch {
      SweetAlert.error("Gagal", "Gagal memblokir pelanggan");
      setData((prev) =>
        prev.map((item) => item.id === p.id ? { ...item, is_isolir: p.is_isolir, status: p.status } : item)
      );
    } finally {
      setLoadingIsolir((prev) => ({ ...prev, [p.id]: false }));
    }
  }, [routerId, setData]);

  return {
    loadingIsolir,
    handleIsolir,
    handleUnIsolir,
    handleBlock,
  };
}
