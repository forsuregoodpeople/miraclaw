"use client";

import { useCallback } from "react";
import { ResourceData } from "@/lib/api/mikrotik";
import { useMikrotikResources } from "@/lib/hooks/useMikrotikResources";

interface RouterRealtimeMonitorProps {
  routerId: number;
  isActive: boolean;
  onDataUpdate: (data: ResourceData, routerId: number) => void;
}

export function RouterRealtimeMonitor({ routerId, isActive, onDataUpdate }: RouterRealtimeMonitorProps) {
  const handleMessage = useCallback((data: ResourceData) => {
    onDataUpdate(data, routerId);
  }, [onDataUpdate, routerId]);

  useMikrotikResources({
    routerId,
    enabled: isActive,
    onMessage: handleMessage,
  });

  return null;
}
