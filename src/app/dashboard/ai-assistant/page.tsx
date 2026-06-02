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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { AVAILABLE_MODELS, type AiModelOption } from "@/lib/ai-client";

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
}

const COMMAND_DESCRIPTIONS: Record<string, { label: string; icon: string }> = {
  "/docs": { label: "Full Protocol", icon: "📋" },
  "/prd": { label: "PRD", icon: "📄" },
  "/trd": { label: "TRD", icon: "⚙️" },
  "/flow": { label: "App Flow", icon: "🔄" },
  "/ux": { label: "UI/UX Brief", icon: "🎨" },
  "/schema": { label: "Schema", icon: "🗄️" },
  "/plan": { label: "Plan", icon: "📅" },
  "/help": { label: "Help", icon: "❓" },
};

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

  // Agentic tool execution steps (shown during loading)
  const [activeToolSteps, setActiveToolSteps] = useState<ToolExecution[]>([]);

  // Per-project AI model (SUPERADMIN only)
  const [projectModel, setProjectModel] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects?limit=100");
        const json = await res.json();
        if (json.success) {
          setProjects(json.data.projects || []);
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
          // Messages come from API in DESC order (newest first) — sort ASC for display
          const msgs = json.data.messages || [];
          setMessages([...msgs].sort((a, b) => {
            const ta = new Date(a.timestamp).getTime();
            const tb = new Date(b.timestamp).getTime();
            return ta - tb;
          }));
        }
      } catch {
        console.error("Failed to fetch messages");
      }
    }
    fetchMessages();
  }, [selectedProject]);

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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    setActiveToolSteps([]); // Reset tool steps for new message
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const body: Record<string, unknown> = {
        projectId: selectedProject.id,
        content,
      };
      // Send images as array (new format)
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
              content: json.data.userMessage.content,
              timestamp: new Date().toISOString(),
              userName: user?.name || "You",
            },
            {
              id: json.data.aiMessage.id,
              role: json.data.aiMessage.role,
              content: json.data.aiMessage.content,
              timestamp: new Date().toISOString(),
              userName: "Karma Space AI",
              toolExecutions: json.data.toolExecutions || undefined,
            },
          ];
        });
      } else {
        setError(json.error || "Failed to send message");
      }
    } catch {
      setError("Network error. Please try again.");
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
    setInputValue(command + " ");
    inputRef.current?.focus();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: { data: string; name: string; type: string }[] = [];
    const MAX_FILES = 5;
    const MAX_SIZE_MB = 10;

    for (let i = 0; i < Math.min(files.length, MAX_FILES - attachedFiles.length); i++) {
      const file = files[i];

      // Check file size
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Image "${file.name}" is too large. Maximum size is ${MAX_SIZE_MB}MB.`);
        continue;
      }

      // Read file as base64
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

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExportPdf = async () => {
    if (!selectedProject) return;
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/ai/project-pdf?projectId=${selectedProject.id}`
      );
      if (!res.ok) {
        throw new Error("Failed to export PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProject.name.replace(/\s+/g, "_")}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.description?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 sm:-m-6 lg:-m-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h1 className="font-semibold text-lg">Karma Space</h1>
            </div>

            {/* Project Selector */}
            <Popover
              open={projectPopoverOpen}
              onOpenChange={setProjectPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="ml-2 gap-2 text-sm h-9 max-w-[240px]"
                >
                  {selectedProject ? (
                    <>
                      {selectedProject.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
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
                      <Search className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-muted-foreground">
                        Select Project...
                      </span>
                    </>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
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

          {/* Right side: Model selector + Export PDF (SUPERADMIN only) */}
          <div className="flex items-center gap-2">
            {/* AI Model Selector - SUPERADMIN only */}
            {isSuperAdmin && selectedProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
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

            {/* Export PDF button for SUPERADMIN */}
            {isSuperAdmin && selectedProject && (
              <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
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
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          {!selectedProject ? (
            // Empty State - No project selected
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
          ) : messages.length === 0 ? (
            // Empty State - No messages yet
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
            // Messages
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 overflow-hidden">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-3 min-w-0 max-w-[85%] ${
                        message.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
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
                          <Bot className="h-4 w-4" />
                        )}
                      </div>

                      {/* Message Bubble */}
                      <div className="min-w-0 max-w-full flex flex-col gap-1.5">
                        {/* Tool Executions (shown above the message) */}
                        {message.toolExecutions && message.toolExecutions.length > 0 && (
                          <div className="rounded-lg border bg-card px-3 py-2 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <Wrench className="h-3 w-3" />
                              <span className="font-medium">Actions performed</span>
                            </div>
                            {message.toolExecutions.map((tool, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-sm">{tool.icon}</span>
                                <span className="flex-1 text-muted-foreground">{tool.displayMessage}</span>
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
                        <div
                          className={`rounded-xl px-4 py-3 break-words overflow-hidden ${
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {message.role === "assistant" ? (
                            <div className="prose prose-sm max-w-none dark:prose-invert break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="text-sm whitespace-pre-wrap break-words">
                              {message.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="rounded-xl px-4 py-3 bg-muted max-w-[85%]">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Wrench className="h-4 w-4" />
                          <span>Karma Space is working...</span>
                        </div>
                        {/* Show live tool steps during loading */}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="border-t px-4 py-2 bg-destructive/10 flex items-center gap-2 shrink-0">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
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

        {/* File Preview - Multiple images */}
        {attachedFiles.length > 0 && (
          <div className="border-t px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0 bg-muted/50 scrollbar-none">
            <div className="flex gap-2">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="relative group flex items-center gap-1.5 bg-background rounded-lg border px-2.5 py-1.5 shrink-0"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate max-w-[120px]">{file.name}</span>
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
              {/* File Upload */}
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
                <TooltipContent>Attach images (up to 5)</TooltipContent>
              </Tooltip>

              {/* Text Input */}
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedProject
                      ? "Type a message or use a command..."
                      : "Select a project to start..."
                  }
                  disabled={!selectedProject || isLoading}
                  className="w-full resize-none rounded-xl border bg-background px-4 py-2.5 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px] max-h-[120px]"
                  rows={1}
                  style={{
                    height: "auto",
                    minHeight: "42px",
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
    </TooltipProvider>
  );
}
