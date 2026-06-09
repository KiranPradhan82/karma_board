'use client';

import { toast } from 'sonner';
import { Copy, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

/**
 * Ensure any error value is a string — prevents React error #31
 */
function stringifyError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    try { return JSON.stringify(err, null, 2); } catch { /* fall through */ }
  }
  return String(err);
}

interface ErrorToastOptions {
  /** Short user-facing label (shown as toast title) */
  title?: string;
  /** The error — can be string, object, Error, etc. */
  error: unknown;
  /** Optional extra technical details (URL, stack, etc.) */
  details?: string;
  /** Duration in ms. Default: 10000 (10s). Set to Infinity to persist. */
  duration?: number;
}

/**
 * Show a rich error toast with:
 * - Full technical error message (not truncated)
 * - Optional expandable details section
 * - Copy to clipboard button
 * - Persistent display (auto-dismisses after 10s by default)
 *
 * Usage:
 *   errorToast({ error: json.error })                          // simplest
 *   errorToast({ title: "Save failed", error: json.error })    // with title
 *   errorToast({ error: json.error, details: `URL: ${url}` })   // with details
 */
export function errorToast({ title, error, details, duration = 10000 }: ErrorToastOptions) {
  const errorMsg = stringifyError(error);
  const timestamp = new Date().toISOString();

  // Build the full technical text for clipboard
  const copyText = [
    title ? `Title: ${title}` : null,
    `Error: ${errorMsg}`,
    details ? `Details: ${details}` : null,
    `Timestamp: ${timestamp}`,
  ].filter(Boolean).join('\n');

  toast.custom(
    () => <ErrorToastCard title={title} message={errorMsg} details={details} copyText={copyText} />,
    { duration, position: 'bottom-right' }
  );
}

/**
 * Inline error card used inside the toast.
 * Has expand/collapse for details and a copy button.
 */
function ErrorToastCard({
  title,
  message,
  details,
  copyText,
}: {
  title?: string;
  message: string;
  details?: string;
  copyText: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(!!details);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-red-200 bg-white dark:bg-zinc-900 dark:border-red-800 shadow-lg">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{title}</p>
          )}
          <p className="text-xs text-red-600 dark:text-red-300 mt-0.5 break-words whitespace-pre-wrap leading-relaxed">
            {message}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title="Copy error details"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expandable Details */}
      {details && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>
          {expanded && (
            <div className="px-3 pb-2.5">
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-red-500/80 dark:text-red-400/70 bg-red-50 dark:bg-red-950/20 rounded p-2 max-h-32 overflow-y-auto">
                {details}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
