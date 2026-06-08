"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Minus,
  Maximize2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  TerminalSquare,
  Trash2,
} from "lucide-react";

export interface TerminalEntry {
  id: string;
  command: string;
  status: "success" | "error";
  output: string;
  conclusion?: string;
  runUrl?: string;
  timestamp: Date;
}

interface TerminalPanelProps {
  entries: TerminalEntry[];
  onToggle: () => void;
  isMinimized: boolean;
  onClear?: () => void;
}

export function TerminalPanel({
  entries,
  onToggle,
  isMinimized,
  onClear,
}: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isMinimized]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-3.5 w-3.5 text-green-400" />
          <span className="text-[11px] font-semibold text-green-400 tracking-tight">
            Terminal
          </span>
          {entries.length > 0 && (
            <span className="text-[10px] text-zinc-600 ml-1">
              {entries.length} command{entries.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {entries.length > 0 && onClear && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800"
                    onClick={onClear}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear terminal</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  onClick={onToggle}
                >
                  {isMinimized ? (
                    <Maximize2 className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isMinimized ? "Maximize" : "Minimize"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Terminal Content */}
      {!isMinimized && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs"
        >
          {entries.length > 0 ? (
            entries.map((entry) => (
              <div key={entry.id} className="space-y-1">
                {/* Command prompt */}
                <div className="flex items-start gap-2">
                  <span className="text-green-500 shrink-0 select-none">$</span>
                  <span className="text-zinc-100 break-all leading-relaxed">
                    {entry.command}
                  </span>
                </div>

                {/* Output */}
                {entry.output && (
                  <pre className="text-zinc-400 whitespace-pre-wrap break-all leading-relaxed ml-4">
                    {entry.output.length > 8000
                      ? entry.output.slice(0, 8000) +
                        "\n\n... (output truncated, " +
                        entry.output.length.toLocaleString() +
                        " chars total)"
                      : entry.output}
                  </pre>
                )}

                {/* Conclusion */}
                {entry.conclusion && (
                  <div className="ml-4 text-zinc-500 italic text-[11px] leading-relaxed">
                    → {entry.conclusion}
                  </div>
                )}

                {/* Status & run URL */}
                <div className="flex items-center gap-2 ml-4 mt-0.5">
                  {entry.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  )}
                  <span
                    className={
                      entry.status === "success"
                        ? "text-green-500/80"
                        : "text-red-500/80"
                    }
                  >
                    {entry.status === "success" ? "Exit 0" : "Error"}
                  </span>
                  {entry.runUrl && (
                    <a
                      href={entry.runUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 hover:text-zinc-300 inline-flex items-center gap-1 ml-2 transition-colors"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      <span className="text-[10px]">Run</span>
                    </a>
                  )}
                </div>

                {/* Separator */}
                <div className="border-t border-zinc-800/40 mt-2" />
              </div>
            ))
          ) : (
            <div className="text-zinc-600 py-6 text-[11px] leading-relaxed">
              <span className="text-zinc-700 select-none">{'// '}</span>
              {'Terminal output will appear here when commands are executed'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
