"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Polyline, Tooltip } from "react-leaflet";
import { FiberLink } from "@/types/map.types";
import { useMapStore } from "@/store/mapStore";

interface StreamingTopologyLineProps {
  link: FiberLink;
  streamingEnabled?: boolean;
  streamingSpeed?: "slow" | "normal" | "fast";
  showRealTimeStats?: boolean;
}

// Streaming animation styles
const STREAMING_STYLES = {
  slow: {
    dashArray: "20, 20",
    dashOffset: "40",
    weight: 4,
    animationDuration: "3s",
  },
  normal: {
    dashArray: "15, 15",
    dashOffset: "30",
    weight: 4,
    animationDuration: "2s",
  },
  fast: {
    dashArray: "10, 10",
    dashOffset: "20",
    weight: 4,
    animationDuration: "1s",
  },
};

// Status-based colors with streaming variations
const STATUS_COLORS = {
  active: {
    base: "#10b981",
    streaming: "#22d3ee", // Cyan for active streaming
    degraded: "#f59e0b",
    broken: "#ef4444",
  },
  degraded: {
    base: "#f59e0b",
    streaming: "#fbbf24",
    degraded: "#f59e0b",
    broken: "#ef4444",
  },
  broken: {
    base: "#ef4444",
    streaming: "#dc2626",
    degraded: "#f59e0b",
    broken: "#ef4444",
  },
};

export default function StreamingTopologyLine({
  link,
  streamingEnabled = true,
  streamingSpeed = "normal",
  showRealTimeStats = true,
}: StreamingTopologyLineProps) {
  const { selectLink, getDeviceById, updateLink } = useMapStore();
  const fromDevice = getDeviceById(link.fromDeviceId);
  const toDevice = getDeviceById(link.toDeviceId);
  
  const [streamingProgress, setStreamingProgress] = useState(0);
  const [realTimeStats, setRealTimeStats] = useState({
    bandwidthUsage: 0,
    latency: 0,
    packetLoss: 0,
    lastUpdate: new Date().toISOString(),
  });
  
  const [isHovered, setIsHovered] = useState(false);
  
  // Determine line color based on status and streaming
  const getLineColor = useCallback(() => {
    const statusColors = STATUS_COLORS[link.status] || STATUS_COLORS.active;
    
    if (streamingEnabled && link.status === "active") {
      return statusColors.streaming;
    }
    return statusColors.base;
  }, [streamingEnabled, link.status]);
  
  // Get streaming style
  const streamingStyle = STREAMING_STYLES[streamingSpeed];
  
  // Calculate real-time stats based on link properties
  useEffect(() => {
    if (!streamingEnabled || link.status !== "active") return;
    
    // Simulate real-time data updates
    const interval = setInterval(() => {
      // Update streaming progress
      setStreamingProgress(prev => (prev + 5) % 100);
      
      // Update real-time stats with some variation
      setRealTimeStats(prev => ({
        bandwidthUsage: Math.max(0, Math.min(1000, 
          prev.bandwidthUsage + (Math.random() - 0.5) * 20
        )),
        latency: Math.max(10, Math.min(100,
          prev.latency + (Math.random() - 0.5) * 5
        )),
        packetLoss: Math.max(0, Math.min(5,
          prev.packetLoss + (Math.random() - 0.5) * 0.5
        )),
        lastUpdate: new Date().toISOString(),
      }));
      
      // Occasionally update link status based on real-time conditions
      if (Math.random() > 0.95) {
        const newAttenuation = Math.max(0.5, Math.min(10, 
          link.attenuation + (Math.random() - 0.5) * 0.2
        ));
        
        updateLink(link.id, {
          attenuation: parseFloat(newAttenuation.toFixed(2)),
        });
      }
      
    }, 1000);
    
    return () => clearInterval(interval);
  }, [streamingEnabled, link.status, link.id, link.attenuation, updateLink]);
  
  // Calculate line weight based on bandwidth usage
  const lineWeight = useMemo(() => {
    if (!streamingEnabled || link.status !== "active") {
      return link.status === "degraded" ? 2 : 3;
    }
    
    const baseWeight = streamingStyle.weight;
    const bandwidthFactor = realTimeStats.bandwidthUsage / 1000; // 0-1 based on max 1000 Mbps
    return baseWeight + bandwidthFactor * 3; // 4-7 weight based on usage
  }, [streamingEnabled, link.status, streamingStyle.weight, realTimeStats.bandwidthUsage]);
  
  // Calculate opacity based on status and hover
  const lineOpacity = useMemo(() => {
    if (link.status === "broken") return 0.5;
    if (isHovered) return 0.9;
    return 0.7;
  }, [link.status, isHovered]);
  
  // Generate dash array for streaming effect
  const dashArray = useMemo(() => {
    if (!streamingEnabled || link.status !== "active") {
      return link.status === "degraded" ? "5,5" : undefined;
    }
    
    // Animated dash array for streaming effect
    const offset = streamingProgress;
    return `${streamingStyle.dashArray}, ${offset}`;
  }, [streamingEnabled, link.status, streamingStyle.dashArray, streamingProgress]);
  
  // Custom path options for streaming
  const pathOptions = useMemo(() => {
    const baseOptions: any = {
      color: getLineColor(),
      weight: lineWeight,
      opacity: lineOpacity,
      lineCap: "round" as const,
      lineJoin: "round" as const,
    };
    
    if (dashArray) {
      baseOptions.dashArray = dashArray;
      
      if (streamingEnabled && link.status === "active") {
        // Add CSS animation for streaming effect
        baseOptions.className = "streaming-line";
      }
    }
    
    return baseOptions;
  }, [getLineColor, lineWeight, lineOpacity, dashArray, streamingEnabled, link.status]);
  
  // Format bandwidth display
  const formatBandwidth = (bps: number) => {
    if (bps >= 1000) {
      return `${(bps / 1000).toFixed(1)} Gbps`;
    }
    return `${bps.toFixed(0)} Mbps`;
  };
  
  // Format time
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  if (!fromDevice || !toDevice) return null;
  
  return (
    <>
      <Polyline
        pathOptions={pathOptions}
        positions={link.points}
        eventHandlers={{
          click: () => selectLink(link.id),
          mouseover: () => setIsHovered(true),
          mouseout: () => setIsHovered(false),
        }}
      >
        <Tooltip 
          permanent={false} 
          direction="top" 
          opacity={0.95}
          className="streaming-tooltip"
        >
          <div className="p-3 min-w-[280px] bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Fiber Link
                {streamingEnabled && link.status === "active" && (
                  <span className="ml-2 inline-flex items-center">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <span className="ml-1 text-xs text-cyan-600 dark:text-cyan-400">
                      Streaming
                    </span>
                  </span>
                )}
              </h4>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                link.status === "active" 
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : link.status === "degraded"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}>
                {link.status.toUpperCase()}
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Connection:</span>
                <span className="font-medium">
                  {fromDevice.name} → {toDevice.name}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Distance:</span>
                <span className="font-medium">{link.distance}m</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Attenuation:</span>
                <span className="font-medium">{link.attenuation.toFixed(2)} dB</span>
              </div>
              
              {/* Real-time streaming stats */}
              {showRealTimeStats && streamingEnabled && link.status === "active" && (
                <>
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Real-time Stats
                    </h5>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Bandwidth:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {formatBandwidth(realTimeStats.bandwidthUsage)}
                          </span>
                          <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-cyan-500 transition-all duration-300"
                              style={{ width: `${Math.min(100, realTimeStats.bandwidthUsage / 10)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Latency:</span>
                        <span className={`font-medium ${
                          realTimeStats.latency > 50 ? "text-yellow-600" : "text-green-600"
                        }`}>
                          {realTimeStats.latency.toFixed(0)} ms
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Packet Loss:</span>
                        <span className={`font-medium ${
                          realTimeStats.packetLoss > 2 ? "text-red-600" : "text-green-600"
                        }`}>
                          {realTimeStats.packetLoss.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                        Updated: {formatTime(realTimeStats.lastUpdate)}
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              <div className="pt-2">
                <button
                  onClick={() => selectLink(link.id)}
                  className="w-full text-center text-sm text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium"
                >
                  Click for more details
                </button>
              </div>
            </div>
          </div>
        </Tooltip>
      </Polyline>
      
      {/* Inline styles for streaming animation */}
      <style jsx global>{`
        @keyframes streamFlow {
          0% {
            stroke-dashoffset: 40;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        
        .streaming-line {
          animation: streamFlow ${streamingStyle.animationDuration} linear infinite;
        }
        
        .streaming-tooltip .leaflet-tooltip {
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        .streaming-tooltip .leaflet-tooltip-top:before {
          border-top-color: rgba(0, 0, 0, 0.1);
        }
        
        .streaming-tooltip .leaflet-tooltip-bottom:before {
          border-bottom-color: rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </>
  );
}