"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD_MS = 30 * 1000; // Show warning 30 seconds before logout
const WARNING_AT_MS = INACTIVITY_TIMEOUT_MS - WARNING_THRESHOLD_MS;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

const STORAGE_KEY = "karmaboard_last_activity";

export function useInactivityTimer() {
  const { data: session, status } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(0);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    signOut({ callbackUrl: "/login" });
  }, []);

  // Core timer logic — all state updates happen inside setTimeout callbacks
  const startTimers = useCallback((warningDelay: number, logoutDelay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, warningDelay);

    timerRef.current = setTimeout(() => {
      setShowWarning(false);
      handleLogout();
    }, logoutDelay);
  }, [handleLogout]);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    sessionStorage.setItem(STORAGE_KEY, String(now));

    // Hide warning if visible — this is called from event handlers, not effects
    setShowWarning(false);

    startTimers(WARNING_AT_MS, INACTIVITY_TIMEOUT_MS);
  }, [startTimers]);

  const stayActive = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    // Check sessionStorage for last activity timestamp
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const storedTime = parseInt(stored, 10);
      const elapsed = Date.now() - storedTime;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleLogout();
        return;
      }
      lastActivityRef.current = storedTime;

      if (elapsed >= WARNING_AT_MS) {
        // Already past warning threshold — defer to setTimeout
        const remaining = INACTIVITY_TIMEOUT_MS - elapsed;
        const initTimer = setTimeout(() => {
          setShowWarning(true);
          timerRef.current = setTimeout(() => {
            setShowWarning(false);
            handleLogout();
          }, remaining);
        }, 0);
        warningTimerRef.current = initTimer;
      } else {
        // Still within safe zone — defer timer start to avoid sync setState
        const resumeTimer = setTimeout(() => {
          startTimers(WARNING_AT_MS - elapsed, INACTIVITY_TIMEOUT_MS - elapsed);
        }, 0);
        // Store in a separate ref so cleanup works
        const resumeRef = { current: resumeTimer as unknown as number | null };
        // We'll clean it up below
      }
    } else {
      // No stored timestamp — defer start to setTimeout
      const initTimer = setTimeout(() => {
        startTimers(WARNING_AT_MS, INACTIVITY_TIMEOUT_MS);
      }, 0);
      warningTimerRef.current = initTimer;
    }

    // Listen for user activity
    const handleActivity = () => {
      resetTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [status, session, startTimers, handleLogout, resetTimer]);

  return { showWarning, stayActive };
}