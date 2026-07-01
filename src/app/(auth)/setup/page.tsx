"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorToast } from "@/lib/error-toast";
import {
  Loader2,
  UserPlus,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Bug,
} from "lucide-react";
import { SiteLogo } from "@/components/site-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ApiDebug {
  step?: string;
  dbMode?: string;
  envCheck?: Record<string, boolean>;
  tursoUrl?: string;
  createdUserId?: string;
  createdEmail?: string;
  createdRole?: string;
  existingAdminId?: string;
  zodErrors?: Array<{ path: string[]; message: string }>;
  timestamp?: string;
}

interface ApiError {
  name?: string;
  message?: string;
  stack?: string;
  cause?: { name?: string; message?: string; stack?: string } | string;
}

export default function SetupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorDetail, setErrorDetail] = useState<{
    status: number;
    error: string;
    _error?: ApiError;
    _debug?: ApiDebug;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupRequired) {
          router.push("/login");
        }
      })
      .catch(() => {
        // If check fails, still show setup page
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setErrorDetail(null);
    setShowDebug(false);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error("Password must contain at least one letter and one number");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const json = await res.json();

      if (!json.success) {
        setErrorDetail({
          status: res.status,
          error: json.error || "Setup failed",
          _error: json._error,
          _debug: json._debug,
        });
        toast.error(json.error || "Setup failed");
        return;
      }

      toast.success("Account created! Please sign in.");
      router.push("/login");
    } catch (err) {
      setErrorDetail({
        status: 0,
        error: err instanceof Error ? err.message : "Network error - could not reach server",
        _debug: {
          step: "network-error",
          envCheck: {
            url: typeof window !== "undefined" ? window.location.href : "unknown",
          },
        },
      });
      errorToast({ error: err, title: "Setup failed" });
    } finally {
      setIsLoading(false);
    }
  }

  const getDebugReport = useCallback(() => {
    return JSON.stringify(errorDetail, null, 2);
  }, [errorDetail]);

  const handleCopy = useCallback(async () => {
    const report = getDebugReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [getDebugReport]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Brand logo above card */}
        <div className="flex flex-col items-center gap-2">
          <SiteLogo size={56} className="rounded-2xl" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">KarmaBoard</h1>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Welcome to KarmaBoard
            </CardTitle>
            <CardDescription>
              Create your superadmin account to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Your name"
                  autoComplete="name"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 characters, letters + numbers"
                    autoComplete="new-password"
                    required
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowConfirm(!showConfirm)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters with letters and numbers
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Create Account
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error detail panel with copyable debug info */}
        {errorDetail && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
            <div className="p-3 space-y-2">
              <p className="text-sm font-medium text-destructive">
                Error {errorDetail.status || "Network"}: {errorDetail.error}
              </p>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bug className="h-3.5 w-3.5" />
                {showDebug ? "Hide" : "Show"} technical details
                {showDebug ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {showDebug && (
                <ScrollArea className="max-h-72 rounded-md border bg-muted/50">
                  <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all text-foreground">
                    {JSON.stringify(errorDetail, null, 2)}
                  </pre>
                </ScrollArea>
              )}

              {showDebug && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy details
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
