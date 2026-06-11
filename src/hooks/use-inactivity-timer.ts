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
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (initTimerRef.current) clearTimeout(initTimerRef.current);
    logoutTimerRef.current = null;
    warningTimerRef.current = null;
    initTimerRef.current = null;
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    signOut({ callbackUrl: "/login" });
  }, []);

  const scheduleLogout = useCallback((warningDelay: number, logoutDelay: number) => {
    clearAllTimers();

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, warningDelay);

    logoutTimerRef.current = setTimeout(() => {
      setShowWarning(false);
      handleLogout();
    }, logoutDelay);
  }, [clearAllTimers, handleLogout]);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    sessionStorage.setItem(STORAGE_KEY, String(now));
    setShowWarning(false);
    scheduleLogout(WARNING_AT_MS, INACTIVITY_TIMEOUT_MS);
  }, [scheduleLogout]);

  const stayActive = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (status !== "authenticated" || !session) {
      clearAllTimers();
      return;
    }

    // Check sessionStorage for last activity timestamp
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const storedTime = parseInt(stored, 10);
      const elapsed = Date.now() - storedTime;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleLogout();
        return;
      }

      if (elapsed >= WARNING_AT_MS) {
        // Already past warning threshold — show warning immediately, then logout after remaining time
        const remainingLogout = INACTIVITY_TIMEOUT_MS - elapsed;
        initTimerRef.current = setTimeout(() => {
          setShowWarning(true);
          logoutTimerRef.current = setTimeout(() => {
            setShowWarning(false);
            handleLogout();
          }, remainingLogout);
        }, 0);
      } else {
        // Resume timers from where we left off
        initTimerRef.current = setTimeout(() => {
          scheduleLogout(WARNING_AT_MS - elapsed, INACTIVITY_TIMEOUT_MS - elapsed);
        }, 0);
      }
    } else {
      // No stored timestamp — start fresh
      initTimerRef.current = setTimeout(() => {
        scheduleLogout(WARNING_AT_MS, INACTIVITY_TIMEOUT_MS);
      }, 0);
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
      clearAllTimers();
    };
  }, [status, session, scheduleLogout, handleLogout, resetTimer, clearAllTimers]);

  return { showWarning, stayActive };
}
