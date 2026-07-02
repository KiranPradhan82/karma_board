"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2, Mail, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface SecurityCodeGateProps {
  onVerified: () => void;
}

export default function SecurityCodeGate({ onVerified }: SecurityCodeGateProps) {
  const [phase, setPhase] = useState<"request" | "enter">("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const requestCode = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/security-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "AI_CHAT" }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to generate code");
        return;
      }

      if (data.code) {
        // Email failed — show code inline
        setFallbackCode(data.code);
        setPhase("enter");
        setEmailSent(false);
      } else {
        setPhase("enter");
        setEmailSent(true);
        setCountdown(60);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyCode = useCallback(
    async (codeToVerify: string) => {
      if (codeToVerify.length !== 6) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/security-code/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeToVerify, purpose: "AI_CHAT" }),
        });
        const data = await res.json();
        if (data.success) {
          onVerified();
        } else {
          setError(data.error || "Verification failed");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [onVerified],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Security Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A security code is required to access AI Chat
          </p>
        </div>

        {phase === "request" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Two-factor verification required
                  </p>
                  <p className="mt-1">
                    For security, a 6-character code will be sent to your email
                    each time you open AI Chat. The code expires in 5 minutes.
                  </p>
                </div>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={requestCode}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send Security Code to Email
            </Button>
            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {phase === "enter" && (
          <div className="space-y-4">
            {emailSent && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center text-sm text-green-600 dark:text-green-400">
                <Mail className="mx-auto mb-1 h-4 w-4" />
                Code sent to your email. Check your inbox.
              </div>
            )}

            {fallbackCode && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center text-sm text-amber-600 dark:text-amber-400">
                Email delivery is not configured. Use this code:
                <div className="mt-2 font-mono text-2xl font-bold tracking-widest text-foreground">
                  {fallbackCode}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Enter 6-character security code
              </label>
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(val) => {
                  setCode(val.toUpperCase());
                  setError("");
                  if (val.length === 6) {
                    verifyCode(val.toUpperCase());
                  }
                }}
                disabled={loading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={requestCode}
                disabled={loading || countdown > 0}
              >
                {loading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                {countdown > 0
                  ? `Resend in ${countdown}s`
                  : "Resend Code"}
              </Button>

              {!fallbackCode && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setPhase("request");
                    setCode("");
                    setError("");
                  }}
                >
                  Back
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}