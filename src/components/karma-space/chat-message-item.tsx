"use client";

import React, { memo, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Cpu,
  FileDown,
  Copy,
  Globe,
  MessageSquare,
  ChevronDown,
  Zap,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


/* ===== Types ===== */

export interface ToolExecution {
  toolName: string;
  label: string;
  icon: string;
  status: "success" | "error" | "running";
  displayMessage: string;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  userName?: string;
  toolExecutions?: ToolExecution[];
  modelRouteReason?: string;
  documentInfo?: {
    id: string;
    docType: string;
    title: string;
    version: number;
  };
  zaiBridge?: {
    chatId: string;
    chatUrl: string;
    context: string;
    modelName: string;
    documentsFound: number;
    chatMessagesFound?: number;
    docsSource?: string;
    isNewChat: boolean;
    aiResponse?: string;
    apiError?: string;
    chunksTotal?: number;
    chunksSent?: number;
    chunkProgress?: string;
  };
}

/* ===== Helpers ===== */

const DOC_TYPE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  prd:    { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  trd:    { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" },
  flow:   { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
  ux:     { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" },
  schema: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  plan:   { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300" },
};
const DOC_TYPE_LABELS: Record<string, string> = {
  prd: "PRD", trd: "TRD", flow: "FLOW", ux: "UX", schema: "SCHEMA", plan: "PLAN",
};

function safeContent(content: unknown): string {
  return typeof content === "string" ? content : content != null ? JSON.stringify(content) : "";
}

const PROSE_CLASSES = "prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary/80 [&_code]:text-xs [&_code]:bg-background/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-background/30 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto [&_table]:text-xs [&_th]:p-1 [&_td]:p-1 [&_th]:border [&_td]:border";

/* ===== Callback Types ===== */

export interface ChatMessageCallbacks {
  isMobile: boolean;
  downloadingPdf: string | null;
  downloadingDocPdf: string | null;
  expandedDocs: Set<string>;
  zaiCopiedId: string | null;
  zaiChatExpanded: boolean;
  zaiChatMessages: Array<{ role: "user" | "assistant"; content: string }>;
  zaiChatLoading: boolean;
  onToggleDocExpand: (id: string) => void;
  onDownloadPdf: (msg: ChatMessage) => void;
  onDownloadDocPdf: (docId: string, docTitle: string) => void;
  onOpenZai: (msg: ChatMessage) => void;
  onCopyZaiContext: (msg: ChatMessage) => void;
  onToggleZaiChat: () => void;
  onSendZaiChat: (codexMsg: ChatMessage, input: string) => void;
}

/* ===== Tool Execution Card ===== */
const ToolExecutionCard = memo(function ToolExecutionCard({ tools }: { tools: ToolExecution[] }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 space-y-1.5 w-full">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Wrench className="h-3 w-3" />
        <span className="font-medium">Actions performed</span>
      </div>
      {tools.map((tool, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span className="text-sm">{tool.icon}</span>
          <span className="flex-1 break-words text-muted-foreground">{tool.displayMessage}</span>
          {tool.status === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : tool.status === "error" ? (
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
});

/* ===== Z.ai Codex Card ===== */
const ZaiCodexCard = memo(function ZaiCodexCard({
  message,
  callbacks,
  userName,
  zaiChatInput,
  onZaiChatInputChange,
}: {
  message: ChatMessage;
  callbacks: ChatMessageCallbacks;
  userName?: string;
  zaiChatInput: string;
  onZaiChatInputChange: (val: string) => void;
}) {
  const bridge = message.zaiBridge!;
  const zaiChatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    requestAnimationFrame(() => {
      zaiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [callbacks.zaiChatMessages]);

  return (
    <div className="w-full rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-primary/10">
        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary">
            {userName ? `${userName}'s` : "Your"} Karmaspace Codex
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
            {bridge.documentsFound} doc{bridge.documentsFound !== 1 ? "s" : ""} + {bridge.chatMessagesFound || 0} chat msg{bridge.chatMessagesFound !== 1 ? "s" : ""}
            {bridge.docsSource === "aiChatScan" ? " (from chat)" : bridge.docsSource === "projectDocument" ? " (from docs table)" : ""}
            {bridge.aiResponse ? " — AI responded" : bridge.apiError ? " — failed" : " — awaiting response"}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              {bridge.documentsFound} Docs
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {bridge.modelName}
            </Badge>
            {bridge.isNewChat ? (
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700">
                New
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                Resumed
              </Badge>
            )}
            {bridge.chunksTotal && bridge.chunksTotal > 1 && (
              <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-700">
                {bridge.chunksSent}/{bridge.chunksTotal} parts
              </Badge>
            )}
          </div>
        </div>
        <div className="shrink-0 hidden sm:block">
          <Zap className="h-4 w-4 text-primary" />
        </div>
      </div>

      {/* API Error */}
      {bridge.apiError && (
        <div className="px-3 sm:px-4 py-3 border-t border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30">
          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">z.ai Error</p>
          <p className="text-xs text-red-500 dark:text-red-300 leading-relaxed break-words">{bridge.apiError}</p>
          {bridge.apiError.includes("401") && (
            <p className="text-xs text-red-500 dark:text-red-300 mt-2 leading-relaxed">
              The z.ai API key has expired. Please update it in <strong>Settings → z.ai Bridge</strong> to continue using Codex.
            </p>
          )}
          {bridge.apiError.includes("429") && (
            <p className="text-xs text-red-500 dark:text-red-300 mt-2 leading-relaxed">
              z.ai free tier rate limit reached even after automatic retries. This is a z.ai limitation — not a KarmaBoard bug. <strong>Wait 60-120 seconds</strong> and try the Launch Codex button again, or use <strong>"Copy Context"</strong> below to paste your project docs directly into z.ai.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            Your documents were still prepared — use "Copy Context" below to paste them in z.ai manually.
          </p>
        </div>
      )}

      {/* AI Response */}
      {bridge.aiResponse && (
        <div className="px-3 sm:px-4 py-3 border-t border-primary/10">
          <p className="text-xs font-medium text-muted-foreground mb-2">z.ai Codex Response</p>
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
            {bridge.aiResponse}
          </div>
        </div>
      )}

      {/* Embedded z.ai Chat */}
      <div className="border-t border-primary/10">
        <button
          className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left hover:bg-primary/5 transition-colors"
          onClick={callbacks.onToggleZaiChat}
        >
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Codex Chat</span>
          <span className="text-[10px] text-muted-foreground">— chat with z.ai directly</span>
          <ChevronDown className={`h-3 w-3 ml-auto text-muted-foreground transition-transform ${callbacks.zaiChatExpanded ? "rotate-180" : ""}`} />
        </button>
        {callbacks.zaiChatExpanded && (
          <div className="border-t border-primary/10">
            {/* Chat messages */}
            <div className="max-h-60 overflow-y-auto px-3 sm:px-4 py-2 space-y-3">
              {callbacks.zaiChatMessages.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  Ask z.ai anything about your project. No redirect needed — it uses your stored API key.
                </p>
              )}
              {callbacks.zaiChatMessages.map((chatMsg, idx) => (
                <div key={idx} className={`flex gap-2 ${chatMsg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {chatMsg.role === "assistant" && (
                    <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    chatMsg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : chatMsg.content.startsWith("Error:")
                        ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                        : "bg-muted text-foreground"
                  }`}>
                    {chatMsg.content}
                  </div>
                </div>
              ))}
              {callbacks.zaiChatLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>z.ai is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={zaiChatEndRef} />
            </div>
            {/* Chat input */}
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-t border-primary/10">
              <input
                type="text"
                className="flex-1 h-8 text-xs bg-background border border-input rounded-md px-3 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Ask about your project..."
                value={zaiChatInput}
                onChange={(e) => onZaiChatInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (zaiChatInput.trim() && !callbacks.zaiChatLoading) {
                      callbacks.onSendZaiChat(message, zaiChatInput.trim());
                      onZaiChatInputChange("");
                    }
                  }
                }}
                disabled={callbacks.zaiChatLoading}
              />
              <Button
                size="sm"
                className="h-8 w-8 p-0 bg-primary text-primary-foreground shrink-0"
                disabled={callbacks.zaiChatLoading || !zaiChatInput.trim()}
                onClick={() => {
                  if (zaiChatInput.trim() && !callbacks.zaiChatLoading) {
                    callbacks.onSendZaiChat(message, zaiChatInput.trim());
                    onZaiChatInputChange("");
                  }
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-t border-primary/10">
        <Button
          variant="default"
          size="sm"
          className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground"
          onClick={() => callbacks.onOpenZai(message)}
        >
          <Globe className="h-3.5 w-3.5" />
          <span>Open z.ai</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => callbacks.onCopyZaiContext(message)}
        >
          {callbacks.zaiCopiedId === message.id ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>{callbacks.zaiCopiedId === message.id ? "Copied!" : "Copy Context"}</span>
        </Button>
      </div>
    </div>
  );
});

/* ===== Document Card ===== */
const DocumentCard = memo(function DocumentCard({
  message,
  callbacks,
}: {
  message: ChatMessage;
  callbacks: ChatMessageCallbacks;
}) {
  const doc = message.documentInfo!;
  const colors = DOC_TYPE_COLORS[doc.docType] || DOC_TYPE_COLORS.prd;
  const label = DOC_TYPE_LABELS[doc.docType] || doc.docType.toUpperCase();
  const isExpanded = callbacks.expandedDocs.has(message.id);

  return (
    <div className="w-full rounded-xl border overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${colors.bg}`}>
        <Badge className={`${colors.badge} text-[11px] font-bold px-2 py-0.5 border-0`}>
          {label}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{doc.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] font-medium ${colors.text}`}>v{doc.version}</span>
            <span className="text-[11px] text-muted-foreground">Auto-saved</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground"
            onClick={() => callbacks.onDownloadDocPdf(doc.id, doc.title)}
            disabled={callbacks.downloadingDocPdf === doc.id}
          >
            {callbacks.downloadingDocPdf === doc.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => callbacks.onToggleDocExpand(message.id)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t px-4 py-3 max-h-96 overflow-y-auto">
          <div className={PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {safeContent(message.content)}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Collapsed preview */}
      {!isExpanded && (
        <div className="border-t px-4 py-2 bg-muted/30">
          <button
            onClick={() => callbacks.onToggleDocExpand(message.id)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronDown className="h-3 w-3" />
            <span>Click to preview content</span>
            <span className="text-muted-foreground/60 ml-1">
              ({safeContent(message.content).split("\n").length} lines)
            </span>
          </button>
        </div>
      )}
    </div>
  );
});

/* ===== Main ChatMessageItem (Memoized) ===== */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  callbacks,
  userName,
  zaiChatInput,
  onZaiChatInputChange,
}: {
  message: ChatMessage;
  callbacks: ChatMessageCallbacks;
  userName?: string;
  zaiChatInput: string;
  onZaiChatInputChange: (val: string) => void;
}) {
  return (
    <div
      className={`flex items-start ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`flex items-start gap-2 ${
          message.role === "user" ? "flex-row-reverse" : ""
        }`}
        style={{ maxWidth: "80%", minWidth: 0 }}
      >
        {/* Avatar */}
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-medium mt-0.5 ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {message.role === "user" ? (
            message.userName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) || "U"
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
        </div>

        {/* Bubble */}
        <div className="min-w-0 flex flex-col gap-1 group">
          {/* Tool Executions */}
          {message.toolExecutions && message.toolExecutions.length > 0 && (
            <ToolExecutionCard tools={message.toolExecutions} />
          )}

          {/* Message Content */}
          {message.role === "assistant" && message.zaiBridge ? (
            <ZaiCodexCard
              message={message}
              callbacks={callbacks}
              userName={userName}
              zaiChatInput={zaiChatInput}
              onZaiChatInputChange={onZaiChatInputChange}
            />
          ) : message.role === "assistant" && message.documentInfo ? (
            <DocumentCard message={message} callbacks={callbacks} />
          ) : (
            <div
              className={`rounded-2xl px-3.5 py-2.5 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              {message.role === "assistant" ? (
                <div className={PROSE_CLASSES}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {safeContent(message.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap m-0">
                  {safeContent(message.content)}
                </p>
              )}
            </div>
          )}

          {/* Model Auto-Route Notice */}
          {message.modelRouteReason && (
            <div className="flex items-center gap-1.5 text-[11px] text-blue-500 dark:text-blue-400 mt-0.5 px-1">
              <Cpu className="h-3 w-3 shrink-0" />
              <span className="break-words">Auto-routed: {message.modelRouteReason.split("Auto-routed to").pop()?.trim()}</span>
            </div>
          )}

          {/* PDF Download button on AI messages with substantial content */}
          {message.role === "assistant" && !message.documentInfo && safeContent(message.content).length > 500 && (
            <button
              onClick={() => callbacks.onDownloadPdf(message)}
              disabled={callbacks.downloadingPdf === message.id}
              className={`inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mt-1 px-1 ${
                callbacks.isMobile
                  ? "text-xs min-h-[32px] px-2 py-1 rounded-md border hover:bg-accent"
                  : "text-[11px] lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
              }`}
              style={{ opacity: callbacks.downloadingPdf === message.id ? 1 : undefined }}
            >
              {callbacks.downloadingPdf === message.id ? (
                <Loader2 className={callbacks.isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} animate-spin />
              ) : (
                <FileDown className={callbacks.isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} />
              )}
              <span>Download PDF</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
