"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Copy, Check, ChevronDown, ChevronUp, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const errorReport = {
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : "unknown",
    errorName: error.name,
    errorMessage: error.message,
    digest: error.digest || null,
    stack: error.stack || null,
    cause: error.cause
      ? error.cause instanceof Error
        ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack }
        : String(error.cause)
      : null,
  };

  const fullReport = JSON.stringify(errorReport, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = fullReport;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [fullReport]);

  useEffect(() => {
    console.error("[GlobalError]", errorReport);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="w-full max-w-lg space-y-4">
            {/* Error icon + title */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="rounded-full bg-destructive/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <h1 className="text-2xl font-bold">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred while loading this page.
              </p>
              {error.digest && (
                <Badge variant="outline" className="font-mono text-xs">
                  Error ID: {error.digest}
                </Badge>
              )}
            </div>

            {/* Error message */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive break-all">
                {error.message || "Unknown error"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={reset} className="flex-1">
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/login")}
                className="flex-1"
              >
                Go to login
              </Button>
            </div>

            {/* Toggle technical details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <Bug className="h-3.5 w-3.5" />
              {showDetails ? "Hide" : "Show"} technical details
              {showDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            {/* Technical details panel */}
            {showDetails && (
              <div className="rounded-lg border bg-muted/50 overflow-hidden">
                <ScrollArea className="max-h-72">
                  <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all text-foreground">
                    {fullReport}
                  </pre>
                </ScrollArea>
                <div className="border-t px-4 py-2 flex items-center justify-between bg-muted/30">
                  <span className="text-xs text-muted-foreground">
                    Click &quot;Copy&quot; to share this with your developer
                  </span>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
