"use client";

import { useEffect } from "react";

export function GlobalErrorHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      
      // Tangani error JSON parse
      if (reason instanceof SyntaxError && reason.message.includes("JSON")) {
        event.preventDefault();
        console.warn("[GlobalErrorHandler] Caught JSON parse error:", reason.message);
        return;
      }
      
      // Tangani error WebSocket
      if (reason instanceof Error && (
        reason.message.includes("WebSocket") || 
        reason.message.includes("websocket")
      )) {
        event.preventDefault();
        console.warn("[GlobalErrorHandler] Caught WebSocket error:", reason.message);
        return;
      }
      
      // Log error lain untuk debugging
      console.error("[GlobalErrorHandler] Unhandled rejection:", reason);
    };

    const handleError = (event: ErrorEvent) => {
      // Tangani error JSON parse dari script
      if (event.error instanceof SyntaxError && event.error.message.includes("JSON")) {
        event.preventDefault();
        console.warn("[GlobalErrorHandler] Caught JSON error:", event.error.message);
        return;
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}
