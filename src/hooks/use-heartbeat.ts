"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export function useHeartbeat(intervalMs: number = 60000) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    const sendHeartbeat = async () => {
      try {
        await fetch("/api/auth/heartbeat", {
          method: "POST",
          credentials: "include",
        });
      } catch (error) {
        console.error("[Heartbeat] Failed:", error);
      }
    };

    // Send immediately on mount
    sendHeartbeat();

    // Then every intervalMs
    const timer = setInterval(sendHeartbeat, intervalMs);

    return () => clearInterval(timer);
  }, [status, session, intervalMs]);
}