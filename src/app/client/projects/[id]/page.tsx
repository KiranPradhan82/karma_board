'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Hammer,
  LogOut,
  Settings,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  Loader2,
  RefreshCw,
  Calendar,
  User,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiError } from "@/hooks/use-api-error";

// ── Types ──────────────────────────────────────────────

interface TodoItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeJobTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TodoSummary {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  completionPercent: number;
}

// ── Configs ────────────────────────────────────────────

const priorityConfig: Record<string, { label: string; className: string }> = {
  HIGH: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  LOW: { label: "Low", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusIconMap: Record<string, { icon: React.ElementType; className: string }> = {
  PENDING: { icon: Circle, className: "text-slate-300 dark:text-slate-600" },
  IN_PROGRESS: { icon: Clock, className: "text-blue-500" },
  PENDING_REVIEW: { icon: Eye, className: "text-orange-500" },
  COMPLETED: { icon: CheckCircle2, className: "text-emerald-500" },
  DONE: { icon: CheckCircle2, className: "text-emerald-500" },
};

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  COMPLETED: "Completed",
  DONE: "Done",
};

// ── Component ──────────────────────────────────────────

export default function ClientProjectDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { showError, ErrorDetailDialog } = useApiError();

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [summary, setSummary] = useState<TodoSummary | null>(null);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const prevLastUpdateRef = useRef<string | null>(null);

  const fetchTodos = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/me/projects/${projectId}/todos`);
      const data = await res.json();
      if (data.success) {
        setTodos(data.data.todos);
        setSummary(data.data.summary);
        setProjectName(data.data.projectName);
        const newLastUpdate = data.data.lastUpdate;
        // Flash indicator if data changed
        if (prevLastUpdateRef.current && newLastUpdate && newLastUpdate !== prevLastUpdateRef.current) {
          // Data was updated by the team
        }
        prevLastUpdateRef.current = newLastUpdate;
        setLastUpdate(newLastUpdate);
      } else {
        showError('Failed to load tasks', data.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to load tasks', errMsg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, showError]);

  // Initial fetch
  useEffect(() => {
    if (authStatus === "authenticated") {
      fetchTodos(true);
    }
  }, [authStatus, fetchTodos]);

  // Auto-refresh every 10 seconds for live updates
  useEffect(() => {
    if (!liveRefresh || loading) return;

    const interval = setInterval(() => {
      fetchTodos(false);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [liveRefresh, loading, fetchTodos]);

  // Apply client-side status filter
  const filteredTodos = statusFilter === "ALL"
    ? todos
    : todos.filter((t) => t.status === statusFilter);

  function formatDueDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch {
      return null;
    }
  }

  function isOverdue(dateStr: string | null, status: string) {
    if (!dateStr || status === "DONE" || status === "COMPLETED") return false;
    return new Date(dateStr) < new Date();
  }

  // ── Render ──

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Hammer className="h-4 w-4" />
              </div>
              <span className="font-semibold text-lg tracking-tight hidden sm:inline">KarmaBoard</span>
              <Badge variant="secondary" className="ml-2 text-[10px]">Client Portal</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/client/login" })}>
                <LogOut className="h-4 w-4 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 mt-14">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="font-semibold text-lg tracking-tight hidden sm:inline">KarmaBoard</span>
            <Badge variant="secondary" className="ml-2 text-[10px]">Client Portal</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/portal">
                <Briefcase className="h-4 w-4 mr-1" />
                Projects
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/client/login" })}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto space-y-6 w-full mt-14">
        {/* Back + Title */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/client/portal")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{projectName}</h1>
            <p className="text-sm text-muted-foreground">Task Progress</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTodos(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Live indicator */}
        {liveRefresh && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live — updates auto-refresh every 10 seconds
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setLiveRefresh(false)}
            >
              Pause
            </Button>
          </div>
        )}
        {!liveRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setLiveRefresh(true);
              fetchTodos(true);
            }}
          >
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
            </span>
            Resume live updates
          </Button>
        )}

        {/* Summary Progress */}
        {summary && summary.total > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{summary.completionPercent}% complete</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {summary.done} done
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      {summary.inProgress} in progress
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      {summary.pending} pending
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{summary.total} total</span>
              </div>
              <Progress value={summary.completionPercent} className="h-2.5" />
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        {summary && summary.total > 0 && (
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Showing {filteredTodos.length} of {todos.length} tasks
            </span>
          </div>
        )}

        {/* Loading more */}
        {refreshing && !loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking for updates...
          </div>
        )}

        {/* Empty State */}
        {todos.length === 0 && !loading && (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <ListTodo className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No tasks have been created yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tasks will appear here once your team adds them.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Todo List */}
        {filteredTodos.length > 0 && (
          <div className="space-y-2">
            {filteredTodos.map((todo) => {
              const priority = priorityConfig[todo.priority] || priorityConfig.MEDIUM;
              const statusIcon = statusIconMap[todo.status] || statusIconMap.PENDING;
              const StatusIcon = statusIcon.icon;
              const isDone = todo.status === "DONE" || todo.status === "COMPLETED";
              const overdue = isOverdue(todo.dueDate, todo.status);
              const dueDateStr = formatDueDate(todo.dueDate);

              return (
                <Card
                  key={todo.id}
                  className={`transition-all ${isDone ? "opacity-60" : ""} ${
                    overdue ? "border-red-200 dark:border-red-800/40" : ""
                  }`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* Status Icon (read-only for client) */}
                      <div className="mt-0.5 shrink-0">
                        <StatusIcon className={`h-5 w-5 ${statusIcon.className}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : ""}`}>
                          {todo.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priority.className}`}>
                            {priority.label}
                          </Badge>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${
                            todo.status === 'DONE' || todo.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                            todo.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            todo.status === 'PENDING_REVIEW' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {statusLabels[todo.status] || todo.status}
                          </Badge>
                          {todo.assigneeName && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {todo.assigneeName}
                              {todo.assigneeJobTitle && (
                                <span className="text-muted-foreground/60">({todo.assigneeJobTitle})</span>
                              )}
                            </span>
                          )}
                          {dueDateStr && (
                            <span className={`text-[11px] flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                              <Calendar className="h-3 w-3" />
                              {overdue && <AlertCircle className="h-3 w-3" />}
                              {dueDateStr}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Last updated */}
        {lastUpdate && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        KarmaBoard — Project Management Made Simple
      </footer>

      {ErrorDetailDialog}
    </div>
  );
}

