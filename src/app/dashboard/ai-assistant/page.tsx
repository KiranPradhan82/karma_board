"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Send,
  Paperclip,
  X,
  Download,
  ChevronDown,
  MessageSquare,
  Sparkles,
  FileText,
  Loader2,
  AlertCircle,
  Search,
  Cpu,
  Wrench,
  CheckCircle2,
  XCircle,
  ImagePlus,
  FileDown,
  Upload,
  FileUp,
  Rocket,
  CheckCircle,
  Trash2,
  KeyRound,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Bell,
  FolderTree,
  TerminalSquare,
  PanelLeft,
  Globe,
  Copy,
  ExternalLink,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AVAILABLE_MODELS, type AiModelOption } from "@/lib/ai-client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { IdeLayout } from "@/components/karma-space/ide-layout";
import { FileExplorer, buildFileTree } from "@/components/karma-space/file-explorer";
import { TerminalPanel } from "@/components/karma-space/terminal-panel";
import type { FileTreeItem } from "@/components/karma-space/file-explorer";
import type { TerminalEntry } from "@/components/karma-space/terminal-panel";

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  color?: string;
}

interface ToolExecution {
  toolName: string;
  label: string;
  icon: string;
  status: "success" | "error" | "running";
  displayMessage: string;
}

interface ChatMessage {
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
  };
}

const COMMAND_DESCRIPTIONS: Record<string, { label: string; icon: string }> = {
  "/docs": { label: "Full Protocol", icon: "📋" },
  "/prd": { label: "PRD", icon: "📄" },
  "/trd": { label: "TRD", icon: "⚙️" },
  "/flow": { label: "App Flow", icon: "🔄" },
  "/ux": { label: "UI/UX Brief", icon: "🎨" },
  "/schema": { label: "Schema", icon: "🗄️" },
  "/plan": { label: "Plan", icon: "📅" },
  "/init": { label: "Init Project", icon: "🚀" },
  "/help": { label: "Help", icon: "❓" },
};

/** Ensure content is always a string — prevents React error #31 when API returns objects */
function safeContent(content: unknown): string {
  return typeof content === "string" ? content : content != null ? JSON.stringify(content) : "";
}

/** Ensure error is always a string — prevents React error #31 when API returns error objects like {code, id, message} */
function safeError(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    try { return JSON.stringify(err); } catch { /* fall through */ }
  }
  return fallback;
}

export default function KarmaSpacePage() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; role?: string } | undefined;
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<{
    data: string;
    name: string;
    type: string;
  }[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null); // message ID being exported
  const [downloadingDocPdf, setDownloadingDocPdf] = useState<string | null>(null); // document ID being downloaded
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [hasDocuments, setHasDocuments] = useState(false);
  const [onboardingPhase, setOnboardingPhase] = useState<"idle" | "requirements" | "complete">("idle");
  const [onboardingTab, setOnboardingTab] = useState<"upload" | "write">("write");
  const [onboardingText, setOnboardingText] = useState("");
  const [onboardingFile, setOnboardingFile] = useState<File | null>(null);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const onboardingFileInputRef = useRef<HTMLInputElement>(null);

  // Agentic tool execution steps (shown during loading)
  const [activeToolSteps, setActiveToolSteps] = useState<ToolExecution[]>([]);

  // Per-project AI model (SUPERADMIN only)
  const [projectModel, setProjectModel] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // Karmaspace Codex bridge state
  const [codexLoading, setCodexLoading] = useState(false);

  // Delete chat flow
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteRequestStatus, setDeleteRequestStatus] = useState<{ status: string; message: string } | null>(null);

  // Super admin: pending delete requests
  const [deleteRequests, setDeleteRequests] = useState<{
    id: string; projectId: string; projectName: string; userId: string; userName: string; userEmail: string; status: string; createdAt: string;
  }[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [deleteReviewDialogOpen, setDeleteReviewDialogOpen] = useState(false);

  // IDE panel state
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<TerminalEntry[]>([]);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Fetch pending delete requests (SUPERADMIN)
  useEffect(() => {
    if (!isSuperAdmin) return;
    async function fetchDeleteRequests() {
      try {
        const res = await fetch("/api/ai/chat/delete-requests?status=PENDING");
        const json = await res.json();
        if (json.success) setDeleteRequests(json.data.deleteRequests || []);
      } catch { /* silent */ }
    }
    fetchDeleteRequests();
    const interval = setInterval(fetchDeleteRequests, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [isSuperAdmin]);

  const handleDeleteChat = async () => {
    if (!selectedProject || !deletePassword.trim()) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/ai/chat/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject.id, password: deletePassword.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setDeleteDialogOpen(false);
        setDeletePassword("");
        setDeleteRequestStatus({ status: "PENDING", message: json.data.message });
      } else {
        setDeleteError(safeError(json.error, "Failed to submit delete request."));
      }
    } catch (err) {
      setDeleteError(safeError(err, "Network error. Please try again."));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleReviewDeleteRequest = async (requestId: string, action: "approve" | "decline") => {
    setReviewingRequestId(requestId);
    try {
      const res = await fetch(`/api/ai/chat/delete-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        setDeleteRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (json.data.status === "APPROVED") {
          // Refresh messages for the affected project
          if (selectedProject) setMessages([]);
        }
      }
    } catch { /* silent */ }
    finally {
      setReviewingRequestId(null);
    }
  };

  const isMobile = useIsMobile();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects?limit=100");
        const json = await res.json();
        if (json.success) {
          const allProjects = json.data.projects || [];
          setProjects(allProjects);
          // If selected project is archived or no longer exists, clear selection
          setSelectedProject((prev) => {
            if (!prev) return null;
            const stillExists = allProjects.find((p: Project) => p.id === prev.id);
            if (!stillExists || stillExists.status === "ARCHIVED") return null;
            return prev;
          });
        }
      } catch {
        console.error("Failed to fetch projects");
      }
    }
    fetchProjects();
  }, []);

  // Load messages when project changes
  useEffect(() => {
    if (!selectedProject) {
      setMessages([]);
      return;
    }

    async function fetchMessages() {
      try {
        const res = await fetch(
          `/api/ai/chat?projectId=${selectedProject.id}&limit=100`
        );
        const json = await res.json();
        if (json.success) {
          // API returns newest first — reverse so oldest is at top
          const msgs = (json.data.messages || []).reverse();
          setMessages(msgs);
        }
      } catch {
        console.error("Failed to fetch messages");
      }
    }
    fetchMessages();
  }, [selectedProject]);

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = chatContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [messages]);

  // Fetch per-project model when project changes (SUPERADMIN)
  useEffect(() => {
    if (!selectedProject) {
      setProjectModel(null);
      return;
    }
    async function fetchProjectModel() {
      try {
        const res = await fetch(`/api/ai/project-model?projectId=${selectedProject.id}`);
        const json = await res.json();
        if (json.success) {
          setProjectModel(json.data.model);
        }
      } catch {
        // silently ignore
      }
    }
    fetchProjectModel();
  }, [selectedProject]);

  // Handle model change
  const handleModelChange = async (newModel: string) => {
    if (!selectedProject) return;
    setIsModelLoading(true);
    try {
      const res = await fetch("/api/ai/project-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject.id,
          model: newModel === "__default__" ? null : newModel,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProjectModel(json.data.model);
      }
    } catch {
      console.error("Failed to update model");
    } finally {
      setIsModelLoading(false);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !selectedProject || isLoading) return;

    const content = inputValue.trim();
    setInputValue("");
    setError(null);
    setIsLoading(true);

    // Optimistically add user message
    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      userName: user?.name || "You",
    };
    setActiveToolSteps([]);
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const body: Record<string, unknown> = {
        projectId: selectedProject.id,
        content,
      };
      // Send images as array
      if (attachedFiles.length > 0) {
        body.files = attachedFiles;
        setAttachedFiles([]);
      }

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (json.success) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== optimisticUserMsg.id);
          return [
            ...filtered,
            {
              id: json.data.userMessage.id,
              role: json.data.userMessage.role,
              content: safeContent(json.data.userMessage.content),
              timestamp: new Date().toISOString(),
              userName: user?.name || "You",
            },
            {
              id: json.data.aiMessage.id,
              role: json.data.aiMessage.role,
              content: safeContent(json.data.aiMessage.content),
              timestamp: new Date().toISOString(),
              userName: "Karma Space AI",
              toolExecutions: json.data.toolExecutions || undefined,
              modelRouteReason: json.data.modelAutoRouted ? json.data.modelRouteReason : undefined,
              documentInfo: json.data.documentInfo || undefined,
            },
          ];
        });
      } else {
        setError(typeof json.error === "string" ? json.error : "Failed to send message");
      }
    } catch (err) {
      console.error("[sendMessage] Error:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
      setActiveToolSteps([]);
      inputRef.current?.focus();
    }
  }, [inputValue, selectedProject, isLoading, attachedFiles, user?.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCommandClick = (command: string) => {
    if (!selectedProject || isLoading) return;
    // Directly send the command instead of just filling the input
    setInputValue(command);
    // Use setTimeout to ensure state is set before sending
    setTimeout(() => {
      const content = command.trim();
      setInputValue("");
      setError(null);
      setIsLoading(true);

      const optimisticUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        userName: user?.name || "You",
      };
      setActiveToolSteps([]);
      setMessages((prev) => [...prev, optimisticUserMsg]);

      fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject.id, content }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== optimisticUserMsg.id);
              return [
                ...filtered,
                {
                  id: json.data.userMessage.id,
                  role: json.data.userMessage.role,
                  content: safeContent(json.data.userMessage.content),
                  timestamp: new Date().toISOString(),
                  userName: user?.name || "You",
                },
                {
                  id: json.data.aiMessage.id,
                  role: json.data.aiMessage.role,
                  content: safeContent(json.data.aiMessage.content),
                  timestamp: new Date().toISOString(),
                  userName: "Karma Space AI",
                  toolExecutions: json.data.toolExecutions || undefined,
                  modelRouteReason: json.data.modelAutoRouted ? json.data.modelRouteReason : undefined,
                  documentInfo: json.data.documentInfo || undefined,
                },
              ];
            });
          } else {
            setError(typeof json.error === "string" ? json.error : "Failed to send message");
          }
        })
        .catch((err) => {
          console.error("[handleCommandClick] Error:", err);
          setError(safeError(err, "Network error. Please check your connection and try again."));
        })
        .finally(() => {
          setIsLoading(false);
          setActiveToolSteps([]);
          inputRef.current?.focus();
        });
    }, 0);
  };

  // Download AI message as PDF
  const handleDownloadPdf = async (msg: ChatMessage) => {
    if (!msg.id || downloadingPdf) return;
    setDownloadingPdf(msg.id);
    try {
      const title = msg.content.split("\n")[0]?.replace(/[#*`]/g, "").trim().slice(0, 60) || "Document";
      const res = await fetch(`/api/ai/export-pdf?messageId=${msg.id}&filename=${encodeURIComponent(title)}`);
      if (!res.ok) {
        // Try to parse error message from the API response
        let errorMsg = "Failed to export PDF";
        try {
          const errJson = await res.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(errorMsg);
      }
      const blob = await res.blob();
      if (blob.size < 100) {
        throw new Error("Generated PDF is empty or corrupted");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[handleDownloadPdf] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setDownloadingPdf(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILES = 5;
    const MAX_SIZE_MB = 10;

    for (let i = 0; i < Math.min(files.length, MAX_FILES - attachedFiles.length); i++) {
      const file = files[i];

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`"${file.name}" is too large. Max ${MAX_SIZE_MB}MB.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setAttachedFiles((prev) => [
          ...prev,
          { data: base64, name: file.name, type: file.type },
        ]);
      };
      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const imageItems: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageItems.push(file);
      }
    }

    // No images in clipboard — let normal text paste happen
    if (imageItems.length === 0) return;

    // Prevent the default paste only when images are present
    // (some browsers insert the image as a blank text otherwise)
    e.preventDefault();

    const MAX_FILES = 5;
    const MAX_SIZE_MB = 10;

    for (let i = 0; i < Math.min(imageItems.length, MAX_FILES - attachedFiles.length); i++) {
      const file = imageItems[i];

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`"Pasted image" (${(file.size / (1024 * 1024)).toFixed(1)}MB) is too large. Max ${MAX_SIZE_MB}MB.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        const mimeType = file.type || "image/png";
        // Generate a name based on timestamp for pasted images
        const name = `pasted-${Date.now()}-${i}.${mimeType.split("/")[1] || "png"}`;
        setAttachedFiles((prev) => [
          ...prev,
          { data: base64, name, type: mimeType },
        ]);
      };
      reader.readAsDataURL(file);
    }

    // If clipboard also has text alongside images, append it to input
    const textData = clipboardData.getData("text/plain");
    if (textData) {
      setInputValue((prev) => prev + textData);
    }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Download stored document PDF by document ID
  const handleDownloadDocumentPdf = async (docId: string, docTitle: string) => {
    if (!docId || downloadingDocPdf) return;
    setDownloadingDocPdf(docId);
    try {
      const res = await fetch("/api/ai/documents/" + docId + "?download=true");
      if (!res.ok) {
        let errorMsg = "Failed to download PDF";
        try {
          const errJson = await res.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(errorMsg);
      }
      const blob = await res.blob();
      if (blob.size < 100) throw new Error("PDF is empty or corrupted");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (docTitle.replace(/\s+/g, "_") || "Document") + ".pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[handleDownloadDocumentPdf] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to download document PDF");
    } finally {
      setDownloadingDocPdf(null);
    }
  };

  // Check if project has generated documents (for "Download All" button)
  // Uses the same keyword-signature detection as the backend export-all-docs endpoint
  useEffect(() => {
    if (!selectedProject || messages.length === 0) {
      setHasDocuments(false);
      return;
    }

    const DOC_SIGNATURES = [
      ["Product Requirements Document", "Executive Summary", "Feature Requirements", "User Stories", "Target Audience", "Product Vision", "Non-Functional Requirements"],
      ["Technical Requirements Document", "Architecture Overview", "Technology Stack", "API Specification", "Security Requirements", "Performance Requirements"],
      ["Application Flow Document", "User Journey", "Screen Flow", "Navigation Architecture", "State Management", "Interaction Patterns"],
      ["UI/UX Design Brief", "Design Principles", "Design System", "Color Palette", "Typography", "Component Guidelines", "Accessibility"],
      ["Backend Schema Document", "Entity Relationship", "Schema Definitions", "Enum Types", "Data Integrity Rules", "Seed Data"],
      ["Implementation Plan", "Phase Breakdown", "Task Breakdown", "Sprint Planning", "Resource Requirements", "Risk Register", "Quality Gates"],
    ];

    const isDocument = (content: string): boolean => {
      if (content.length < 1500) return false;
      const lower = content.toLowerCase();
      return DOC_SIGNATURES.some(keywords =>
        keywords.filter(kw => lower.includes(kw.toLowerCase())).length >= 3
      );
    };

    const docCount = messages.filter(m => m.role === "assistant" && isDocument(m.content)).length;
    setHasDocuments(docCount >= 1);
  }, [messages, selectedProject]);

  // Check if project has ProjectDocument records for onboarding
  useEffect(() => {
    if (!selectedProject || onboardingPhase === "complete") return;
    async function checkDocs() {
      try {
        const res = await fetch("/api/ai/onboarding?projectId=" + selectedProject.id);
        const json = await res.json();
        if (json.success) {
          // If project has documents OR existing chat history, skip onboarding
          if (json.data.isOnboarded || json.data.hasChatHistory) {
            setOnboardingPhase("complete");
          } else if (onboardingPhase === "idle") {
            setOnboardingPhase("requirements");
          }
        }
      } catch {
        // If onboarding check fails, default to showing chat (not onboarding)
        setOnboardingPhase("complete");
      }
    }
    checkDocs();
  }, [selectedProject, onboardingPhase]);

  // Parse tool execution results to populate file tree and terminal output
  useEffect(() => {
    const allDirItems: Array<{ name: string; path: string; type: string; size?: number }> = [];
    const allTerminalEntries: TerminalEntry[] = [];

    for (const msg of messages) {
      if (!msg.toolExecutions) continue;
      for (const tool of msg.toolExecutions) {
        // Parse fs_list_dir results → file tree
        if (tool.toolName === "fs_list_dir" && tool.status === "success") {
          try {
            const data = JSON.parse(tool.displayMessage);
            if (Array.isArray(data.items)) {
              allDirItems.push(...data.items);
            } else if (Array.isArray(data)) {
              allDirItems.push(...data);
            }
          } catch {
            // Not valid JSON — skip
          }
        }
        // Parse exec_command results → terminal entries
        if (tool.toolName === "exec_command" && (tool.status === "success" || tool.status === "error")) {
          try {
            const data = JSON.parse(tool.displayMessage);
            if (data.command) {
              allTerminalEntries.push({
                id: `term-${msg.id}-${allTerminalEntries.length}`,
                command: data.command,
                status: data.status || (tool.status === "error" ? "error" : "success"),
                output: data.output || "",
                conclusion: data.conclusion,
                runUrl: data.runUrl,
                timestamp: new Date(msg.timestamp),
              });
            }
          } catch {
            // Not valid JSON — skip
          }
        }
      }
    }

    if (allDirItems.length > 0) {
      setFileTree(buildFileTree(allDirItems));
    }
    if (allTerminalEntries.length > 0) {
      setTerminalOutput(allTerminalEntries);
    }
  }, [messages]);

  // Handle onboarding submission
  const handleOnboardingSubmit = useCallback(async () => {
    if (!selectedProject || onboardingSubmitting) return;
    if (onboardingTab === "write" && !onboardingText.trim()) {
      setError("Please enter your project requirements or upload a PDF.");
      return;
    }
    if (onboardingTab === "upload" && !onboardingFile) {
      setError("Please select a PDF file to upload.");
      return;
    }
    setOnboardingSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        projectId: selectedProject.id,
        type: onboardingTab === "upload" ? "pdf" : "text",
      };
      if (onboardingTab === "upload" && onboardingFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
        });
        reader.readAsDataURL(onboardingFile);
        const base64 = await base64Promise;
        body.fileData = base64;
      } else {
        body.content = onboardingText.trim();
      }
      const res = await fetch("/api/ai/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setOnboardingPhase("complete");
      } else {
        setError(safeError(json.error, "Failed to submit requirements."));
      }
    } catch (err) {
      setError(safeError(err, "Failed to submit. Please try again."));
    } finally {
      setOnboardingSubmitting(false);
    }
  }, [selectedProject, onboardingTab, onboardingText, onboardingFile, onboardingSubmitting]);

  // Download all documents as one combined PDF
  const handleExportAllDocs = async () => {
    if (!selectedProject || isExportingAll) return;
    setIsExportingAll(true);
    try {
      const res = await fetch(`/api/ai/export-all-docs?projectId=${selectedProject.id}`);
      if (!res.ok) {
        let errorMsg = "Failed to export documents";
        try {
          const errJson = await res.json();
          if (errJson.error) errorMsg = errJson.error;
        } catch { /* not JSON */ }
        throw new Error(errorMsg);
      }
      const blob = await res.blob();
      if (blob.size < 100) throw new Error("Generated PDF is empty or corrupted");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProject.name.replace(/\s+/g, "_")}_All_Documents.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[handleExportAllDocs] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to export documents");
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedProject) return;
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/ai/project-pdf?projectId=${selectedProject.id}`
      );
      if (!res.ok) throw new Error("Failed to export PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProject.name.replace(/\s+/g, "_")}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(safeError(err, "Failed to export PDF"));
    } finally {
      setIsExporting(false);
    }
  };

  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const toggleDocExpand = (id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Launch Codex — bridge to z.ai API, display response in KarmaBoard chat
  const handleStartCodex = async () => {
    if (!selectedProject || codexLoading) return;
    setCodexLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/zai-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject.id }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.chatName} connected via z.ai!`);
        // Add the z.ai Codex response as a message in the chat
        const codexMsg: ChatMessage = {
          id: `codex-${Date.now()}`,
          role: "assistant",
          content: json.aiResponse || `Project context sent to z.ai (${json.documentsFound} documents, ${json.chatMessagesFound} chat messages). The AI will use this context for all future responses in this session. Model: ${json.modelName}`,
          timestamp: new Date().toISOString(),
          userName: "z.ai Codex",
          zaiBridge: {
            chatId: json.chatId,
            chatUrl: json.chatUrl,
            context: json.context,
            modelName: json.modelName,
            documentsFound: json.documentsFound,
            chatMessagesFound: json.chatMessagesFound,
            docsSource: json.docsSource,
            isNewChat: json.isNewChat,
            aiResponse: json.aiResponse,
            apiError: json.apiError,
          },
        };
        setMessages((prev) => [...prev, codexMsg]);
      } else {
        setError(safeError(json.error, "Failed to launch Codex. Ask your Super Admin to configure z.ai Bridge in Settings."));
      }
    } catch (err) {
      console.error("[handleStartCodex] Error:", err);
      setError("Network error launching Codex. Please try again.");
    } finally {
      setCodexLoading(false);
    }
  };

  // Handle z.ai bridge — auto-redirect to z.ai and copy context
  const [zaiCopiedId, setZaiCopiedId] = useState<string | null>(null);
  const [errorCopied, setErrorCopied] = useState(false);
  const [zaiRedirected, setZaiRedirected] = useState<string | null>(null);
  const handleOpenZai = (msg: ChatMessage) => {
    if (!msg.zaiBridge) return;
    // Open z.ai chat in new tab
    window.open(msg.zaiBridge.chatUrl, "_blank", "noopener,noreferrer");
  };
  const handleCopyZaiContext = async (msg: ChatMessage) => {
    if (!msg.zaiBridge) return;
    try {
      await navigator.clipboard.writeText(msg.zaiBridge.context);
      setZaiCopiedId(msg.id);
      toast.success("Project context copied! Paste it in z.ai chat.");
      setTimeout(() => setZaiCopiedId(null), 3000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Color mapping for doc types
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

  const filteredProjects = projects.filter(
    (p) =>
      p.status !== "ARCHIVED" &&
      (p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        p.description?.toLowerCase().includes(projectSearch.toLowerCase()))
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 sm:-m-6 lg:-m-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b px-2 sm:px-4 py-2 sm:py-3 bg-card shrink-0 min-h-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              </div>
              <h1 className="font-semibold text-sm sm:text-lg">Karma Space</h1>
            </div>

            {/* Project Selector */}
            <Popover
              open={projectPopoverOpen}
              onOpenChange={setProjectPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="ml-1 sm:ml-2 gap-1.5 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 max-w-[140px] sm:max-w-[240px]"
                >
                  {selectedProject ? (
                    <>
                      {selectedProject.color && (
                        <span
                          className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: selectedProject.color,
                          }}
                        />
                      )}
                      <span className="truncate">
                        {selectedProject.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                      <span className="text-muted-foreground hidden sm:inline">
                        Select Project...
                      </span>
                    </>
                  )}
                  <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search projects..."
                    value={projectSearch}
                    onValueChange={setProjectSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No projects found.</CommandEmpty>
                    <CommandGroup>
                      {filteredProjects.map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.id}
                          onSelect={() => {
                            setSelectedProject(project);
                            setProjectPopoverOpen(false);
                            setProjectSearch("");
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {project.color && (
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: project.color,
                                }}
                              />
                            )}
                            <span className="truncate text-sm">
                              {project.name}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {project.status}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Right side: Model selector + Export PDF */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isSuperAdmin && selectedProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden sm:flex items-center gap-1.5">
                    {isModelLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <Select
                      value={projectModel || "__default__"}
                      onValueChange={handleModelChange}
                      disabled={isModelLoading}
                    >
                      <SelectTrigger className="w-auto gap-1.5 h-9 text-xs font-normal border-dashed">
                        <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="Default Model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">
                          <span className="text-muted-foreground">Global Default</span>
                        </SelectItem>
                        {(() => {
                          const categories = Array.from(new Set(AVAILABLE_MODELS.map((m) => m.category)));
                          return categories.map((cat) => (
                            <SelectGroup key={cat}>
                              <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</SelectLabel>
                              {AVAILABLE_MODELS.filter((m) => m.category === cat).map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <div className="flex flex-col">
                                    <span>{m.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{m.description} ({m.contextWindow})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {projectModel
                    ? `Using: ${AVAILABLE_MODELS.find((m) => m.id === projectModel)?.name || projectModel}`
                    : "Using global default model"}
                </TooltipContent>
              </Tooltip>
            )}

            {isSuperAdmin && selectedProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 sm:gap-2"
                    onClick={handleExportPdf}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Export PDF</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export project report as PDF</TooltipContent>
              </Tooltip>
            )}

            {/* Delete Chat button — visible when project is selected and has messages */}
            {selectedProject && messages.length > 0 && !isSuperAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
                    onClick={() => { setDeleteDialogOpen(true); setDeleteError(null); setDeletePassword(""); }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete Chat</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete all chat messages for this project</TooltipContent>
              </Tooltip>
            )}

            {/* Pending delete requests badge — SUPERADMIN */}
            {isSuperAdmin && deleteRequests.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-amber-600 border-amber-300 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                    onClick={() => setDeleteReviewDialogOpen(true)}
                  >
                    <Bell className="h-4 w-4" />
                    <span className="hidden sm:inline">{deleteRequests.length} Pending</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{deleteRequests.length} chat delete request{deleteRequests.length > 1 ? "s" : ""} pending review</TooltipContent>
              </Tooltip>
            )}

            {/* Start Karmaspace Codex — bridge to z.ai */}
            {selectedProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 sm:gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm hover:shadow-md"
                    onClick={handleStartCodex}
                    disabled={codexLoading}
                  >
                    {codexLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Launch Codex</span>
                    <span className="sm:hidden">Codex</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Launch agentic AI coding session in z.ai with all project documents and chat context</TooltipContent>
              </Tooltip>
            )}

            {/* Download All Documents button */}
            {isSuperAdmin && selectedProject && hasDocuments && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 sm:gap-2 bg-primary text-primary-foreground"
                    onClick={handleExportAllDocs}
                    disabled={isExportingAll}
                  >
                    {isExportingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">All Documents</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download all generated documents as one PDF</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Main Content Area — split into IDE layout */}
        <div className="flex-1 overflow-hidden">
          <IdeLayout
            fileExplorerOpen={fileExplorerOpen}
            terminalOpen={terminalOpen}
            onFileExplorerOpenChange={setFileExplorerOpen}
            onTerminalOpenChange={setTerminalOpen}
            isMobile={isMobile}
            fileExplorerContent={
              <FileExplorer
                files={fileTree}
                onToggle={() => setFileExplorerOpen(false)}
                onSelectFile={(path) => {
                  setInputValue("Show me the contents of " + path);
                  inputRef.current?.focus();
                }}
              />
            }
            terminalContent={
              <TerminalPanel
                entries={terminalOutput}
                onToggle={() => setTerminalOpen((prev) => !prev)}
                isMinimized={!terminalOpen}
                onClear={() => setTerminalOutput([])}
              />
            }
          >
            <div className="flex flex-col h-full">
              {/* Messages Area — fills remaining space, scrolls independently */}
              <div className="flex-1 overflow-hidden">
          {!selectedProject ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Welcome to Karma Space</h2>
              <p className="text-muted-foreground max-w-md">
                Select a project from the dropdown above to start chatting with
                Karma Space AI and generate comprehensive project documentation.
              </p>
            </div>
          ) : onboardingPhase === "requirements" ? (
            /* Onboarding Screen */
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
              <div className="w-full max-w-lg space-y-6">
                <div className="text-center">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                    <Rocket className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold">Welcome to <span className="text-primary">{selectedProject.name}</span></h2>
                  <p className="text-muted-foreground mt-2">Let's set up your project documentation</p>
                </div>

                <div className="rounded-xl border bg-card p-6 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Provide your product requirements to get started. You can either upload an existing PDF document or type/paste your requirements below.
                  </p>

                  {/* Tab Switcher */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOnboardingTab("upload")}
                      className={"flex-1 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors " + (onboardingTab === "upload" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
                    >
                      <FileUp className="h-4 w-4" />
                      Upload PDF
                    </button>
                    <button
                      onClick={() => setOnboardingTab("write")}
                      className={"flex-1 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors " + (onboardingTab === "write" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}
                    >
                      <FileText className="h-4 w-4" />
                      Write Requirements
                    </button>
                  </div>

                  {/* Upload Tab Content */}
                  {onboardingTab === "upload" && (
                    <div className="space-y-3">
                      <div
                        onClick={() => onboardingFileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                      >
                        <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">Click to upload a PDF</p>
                        <p className="text-xs text-muted-foreground mt-1">Accepts .pdf files</p>
                        {onboardingFile && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[200px]">{onboardingFile.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOnboardingFile(null); }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={onboardingFileInputRef}
                        className="hidden"
                        accept=".pdf"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setOnboardingFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  )}

                  {/* Write Tab Content */}
                  {onboardingTab === "write" && (
                    <div className="space-y-3">
                      <Textarea
                        placeholder="Describe your product requirements here... Include the product vision, target users, key features, and any constraints or preferences you have."
                        value={onboardingText}
                        onChange={(e) => setOnboardingText(e.target.value)}
                        className="min-h-[200px] w-full resize-none"
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleOnboardingSubmit}
                    disabled={onboardingSubmitting || (onboardingTab === "write" && !onboardingText.trim()) || (onboardingTab === "upload" && !onboardingFile)}
                    className="w-full"
                  >
                    {onboardingSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    {onboardingSubmitting ? "Submitting..." : "Submit Requirements"}
                  </Button>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {selectedProject.name}
              </h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Start a conversation or use a quick command to generate
                documentation.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {Object.entries(COMMAND_DESCRIPTIONS).map(([cmd, info]) => (
                  <Button
                    key={cmd}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleCommandClick(cmd)}
                  >
                    <span>{info.icon}</span>
                    <span>{info.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat container — native scroll, newest at bottom */
            <div
              ref={chatContainerRef}
              className="h-full overflow-y-auto"
            >
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
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
                          <div className="rounded-lg border bg-card px-3 py-2 space-y-1.5 w-full">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <Wrench className="h-3 w-3" />
                              <span className="font-medium">Actions performed</span>
                            </div>
                            {message.toolExecutions.map((tool, idx) => (
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
                        )}

                        {/* Message Content */}
                        {message.role === "assistant" && message.zaiBridge ? (
                          <>
                            {/* z.ai Codex Card */}
                            <div className="w-full rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                              <div className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-primary/10">
                                <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                  <Zap className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-primary">
                                    {user?.name ? `${user.name}'s` : "Your"} Karmaspace Codex
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                    {message.zaiBridge.documentsFound} doc{message.zaiBridge.documentsFound !== 1 ? "s" : ""} + {message.zaiBridge.chatMessagesFound || 0} chat msg{message.zaiBridge.chatMessagesFound !== 1 ? "s" : ""}
                                    {message.zaiBridge.docsSource === "aiChatScan" ? " (from chat)" : message.zaiBridge.docsSource === "projectDocument" ? " (from docs table)" : ""}
                                    {message.zaiBridge.aiResponse ? " — AI responded" : message.zaiBridge.apiError ? " — failed" : " — awaiting response"}
                                  </p>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                      {message.zaiBridge.documentsFound} Docs
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px]">
                                      {message.zaiBridge.modelName}
                                    </Badge>
                                    {message.zaiBridge.isNewChat ? (
                                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700">
                                        New
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                                        Resumed
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0 hidden sm:block">
                                  <Zap className="h-4 w-4 text-primary" />
                                </div>
                              </div>
                              {/* API Error */}
                              {message.zaiBridge.apiError && (
                                <div className="px-3 sm:px-4 py-3 border-t border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30">
                                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">z.ai Error</p>
                                  <p className="text-xs text-red-500 dark:text-red-300 leading-relaxed break-words">{message.zaiBridge.apiError}</p>
                                  {message.zaiBridge.apiError.includes("401") && (
                                    <p className="text-xs text-red-500 dark:text-red-300 mt-2 leading-relaxed">
                                      The z.ai authentication token has expired. Please update the token in <strong>Settings → z.ai Bridge</strong> to continue using Codex.
                                    </p>
                                  )}
                                </div>
                              )}
                              {/* AI Response */}
                              {message.zaiBridge.aiResponse && (
                                <div className="px-3 sm:px-4 py-3 border-t border-primary/10">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">z.ai Codex Response</p>
                                  <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                                    {message.zaiBridge.aiResponse}
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-t border-primary/10">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground"
                                  onClick={() => handleOpenZai(message)}
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                  <span>Open z.ai</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 h-8 text-xs"
                                  onClick={() => handleCopyZaiContext(message)}
                                >
                                  {zaiCopiedId === message.id ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                  <span>{zaiCopiedId === message.id ? "Copied!" : "Copy Context"}</span>
                                </Button>
                              </div>
                            </div>
                          </>
                        ) : message.role === "assistant" && message.documentInfo ? (
                          /* ===== Document Card ===== */
                          (() => {
                            const doc = message.documentInfo;
                            const colors = DOC_TYPE_COLORS[doc.docType] || DOC_TYPE_COLORS.prd;
                            const label = DOC_TYPE_LABELS[doc.docType] || doc.docType.toUpperCase();
                            const isExpanded = expandedDocs.has(message.id);
                            return (
                              <div className="w-full rounded-xl border overflow-hidden">
                                {/* Document Card Header */}
                                <div className={`flex items-center gap-3 px-4 py-3 ${colors.bg}`}>
                                  <Badge className={`${colors.badge} text-[11px] font-bold px-2 py-0.5 border-0`}>
                                    {label}
                                  </Badge>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{doc.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-[11px] font-medium ${colors.text}`}>
                                        v{doc.version}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        Auto-saved
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground"
                                      onClick={() => handleDownloadDocumentPdf(doc.id, doc.title)}
                                      disabled={downloadingDocPdf === doc.id}
                                    >
                                      {downloadingDocPdf === doc.id ? (
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
                                      onClick={() => toggleDocExpand(message.id)}
                                    >
                                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                    </Button>
                                  </div>
                                </div>

                                {/* Expandable Content */}
                                {isExpanded && (
                                  <div className="border-t px-4 py-3 max-h-96 overflow-y-auto">
                                    <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                                      [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80
                                      [&_code]:text-xs [&_code]:bg-background/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                                      [&_pre]:bg-background/30 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto
                                      [&_table]:text-xs [&_th]:p-1 [&_td]:p-1 [&_th]:border [&_td]:border"
                                    >
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {safeContent(message.content)}
                                      </ReactMarkdown>
                                    </div>
                                  </div>
                                )}

                                {/* Collapsed preview line */}
                                {!isExpanded && (
                                  <div className="border-t px-4 py-2 bg-muted/30">
                                    <button
                                      onClick={() => toggleDocExpand(message.id)}
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
                          })()
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
                              <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                                [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80
                                [&_code]:text-xs [&_code]:bg-background/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                                [&_pre]:bg-background/30 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto
                                [&_table]:text-xs [&_th]:p-1 [&_td]:p-1 [&_th]:border [&_td]:border"
                              >
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

                        {/* PDF Download button on AI messages with substantial content (no documentInfo) */}
                        {message.role === "assistant" && !message.documentInfo && safeContent(message.content).length > 500 && (
                          <button
                            onClick={() => handleDownloadPdf(message)}
                            disabled={downloadingPdf === message.id}
                            className={`inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mt-1 px-1 ${
                              isMobile
                                ? "text-xs min-h-[32px] px-2 py-1 rounded-md border hover:bg-accent"
                                : "text-[11px] lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                            }`}
                            style={{ opacity: downloadingPdf === message.id ? 1 : undefined }}
                          >
                            {downloadingPdf === message.id ? (
                              <Loader2 className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} animate-spin />
                            ) : (
                              <FileDown className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} />
                            )}
                            <span>Download PDF</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex items-start justify-start">
                    <div className="flex items-start gap-2" style={{ maxWidth: "80%" }}>
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                      <div className="rounded-2xl px-3.5 py-2.5 bg-muted">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Karma Space is thinking...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="border-t px-3 sm:px-4 py-2 bg-destructive/10 flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1 break-words">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`[${new Date().toISOString()}] ${error}`);
                  setErrorCopied(true);
                  toast.success("Error copied");
                  setTimeout(() => setErrorCopied(false), 2000);
                } catch { /* ignore */ }
              }}
              title="Copy error"
            >
              {errorCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 shrink-0"
              onClick={() => setError(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Command Shortcuts */}
        {selectedProject && (
          <div className="border-t px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 bg-card/50 scrollbar-none">
            <span className="text-xs text-muted-foreground shrink-0 mr-1">
              Commands:
            </span>
            {Object.entries(COMMAND_DESCRIPTIONS).map(([cmd, info]) => (
              <Tooltip key={cmd}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleCommandClick(cmd)}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{info.icon}</span>
                    <span>{cmd}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{info.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="border-t px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0 bg-muted/50 scrollbar-none">
            <div className="flex gap-2">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="relative group flex items-center gap-1.5 bg-background rounded-lg border px-1.5 py-1.5 shrink-0 overflow-hidden"
                >
                  {file.type.startsWith("image/") ? (
                    <img
                      src={`data:${file.type};base64,${file.data}`}
                      alt={file.name}
                      className="h-10 w-10 object-cover rounded shrink-0"
                    />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-xs truncate max-w-[100px]">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeAttachedFile(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {attachedFiles.length < 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 shrink-0 text-xs text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Add more</span>
                </Button>
              )}
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {attachedFiles.length}/5
            </Badge>
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t px-4 py-3 bg-card shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              {/* IDE Panel Toggles — Files & Terminal */}
              {selectedProject && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-10 w-10 ${fileExplorerOpen ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                        onClick={() => setFileExplorerOpen((prev) => !prev)}
                      >
                        <FolderTree className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{fileExplorerOpen ? "Hide Files" : "Show Files"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-10 w-10 ${terminalOpen ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                        onClick={() => setTerminalOpen((prev) => !prev)}
                      >
                        <TerminalSquare className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{terminalOpen ? "Hide Terminal" : "Show Terminal"}</TooltipContent>
                  </Tooltip>
                </div>
              )}

              {/* File Upload (hidden input) */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileChange}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-10 w-10"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedProject || isLoading}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach images (up to 5) or paste from clipboard</TooltipContent>
              </Tooltip>

              {/* Text Input */}
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    selectedProject
                      ? "Type a message, use a command, or paste an image..."
                      : "Select a project to start..."
                  }
                  disabled={!selectedProject || isLoading}
                  className="w-full resize-none rounded-xl border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  rows={1}
                  style={{
                    height: "42px",
                    maxHeight: "120px",
                    overflow: "hidden",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                  }}
                />
              </div>

              {/* Send Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="shrink-0 h-10 w-10"
                    onClick={sendMessage}
                    disabled={
                      !selectedProject || isLoading || !inputValue.trim()
                    }
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
            </div>
          </IdeLayout>
        </div>
      </div>
        {/* ===== Delete Chat Confirmation Dialog ===== */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Delete Chat
              </DialogTitle>
              <DialogDescription>
                This action will send a delete request to the super admin. Once approved, all chat messages, generated documents, and project protocols for <strong>{selectedProject?.name}</strong> will be permanently deleted and cannot be restored.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  This cannot be undone. All messages and documents will be permanently removed.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Enter your password to confirm
                </label>
                <input
                  type="password"
                  placeholder="Your current password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !deleteSubmitting) handleDeleteChat(); }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              {deleteError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive flex-1 break-words">{deleteError}</p>
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(deleteError); toast.success("Error copied"); } catch { /* ignore */ }
                    }}
                    className="shrink-0 p-1 hover:bg-destructive/10 rounded"
                    title="Copy error"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSubmitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteChat} disabled={deleteSubmitting || !deletePassword.trim()}>
                {deleteSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                Request Deletion
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== Delete Request Status Banner ===== */}
        {deleteRequestStatus && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
            <div className="flex items-center gap-3 rounded-xl border bg-card shadow-lg p-4">
              {deleteRequestStatus.status === "PENDING" ? (
                <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 dark:bg-amber-900/40">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                </div>
              ) : deleteRequestStatus.status === "APPROVED" ? (
                <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center shrink-0 dark:bg-green-900/40">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 dark:bg-red-900/40">
                  <ShieldX className="h-4 w-4 text-red-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{deleteRequestStatus.message}</p>
              </div>
              <button onClick={() => setDeleteRequestStatus(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ===== Super Admin: Pending Delete Requests Dialog ===== */}
        <Dialog open={deleteReviewDialogOpen} onOpenChange={setDeleteReviewDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Chat Delete Requests
                {deleteRequests.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{deleteRequests.length} pending</Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Review and approve or decline chat deletion requests from team members.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1">
              {deleteRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                  <p className="text-sm">No pending requests</p>
                </div>
              ) : (
                deleteRequests.map((req) => (
                  <div key={req.id} className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{req.projectName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Requested by <strong>{req.userName}</strong> ({req.userEmail})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(req.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 border-amber-300 text-amber-600">Pending</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5 text-xs h-8"
                        disabled={reviewingRequestId === req.id}
                        onClick={() => handleReviewDeleteRequest(req.id, "approve")}
                      >
                        {reviewingRequestId === req.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Approve & Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-8"
                        disabled={reviewingRequestId === req.id}
                        onClick={() => handleReviewDeleteRequest(req.id, "decline")}
                      >
                        <XCircle className="h-3 w-3" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteReviewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </TooltipProvider>
  );
}