'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link";
import { toast } from 'sonner';
import {
  ArrowLeft,
  LogOut,
  User,
  Briefcase,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Hammer,
  Settings,
  ListTodo,
  Loader2,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiError } from '@/hooks/use-api-error';

// ── Types ──────────────────────────────────────────────

interface ClientTodo {
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
  HIGH: { label: 'High', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  LOW: { label: 'Low', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400', icon: Circle },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  DONE: { label: 'Done', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
};

// ── Helpers ────────────────────────────────────────────

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

function isOverdue(dateStr: string | null, status: string) {
  if (!dateStr || status === 'DONE') return false;
  return new Date(dateStr) < new Date();
}

// ── Component ──────────────────────────────────────────

export default function ClientProjectTodosPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { showError, ErrorDetailDialog } = useApiError();

  const [projectName, setProjectName] = useState('');
  const [todos, setTodos] = useState<ClientTodo[]>([]);
  const [summary, setSummary] = useState<TodoSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const lastUpdateRef = useRef<string | null>(null);

  const fetchTodos = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/me/projects/${projectId}/todos`);
      const data = await res.json();
      if (data.success) {
        setProjectName(data.data.projectName);
        setTodos(data.data.todos);
        setSummary(data.data.summary);
        if (data.data.lastUpdate !== lastUpdateRef.current) {
          lastUpdateRef.current = data.data.lastUpdate;
          setLastUpdate(data.data.lastUpdate);
        }
      } else {
        if (data.error?.includes('not found')) {
          router.push('/client/portal');
          return;
        }
        showError('Failed to load tasks', data.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to load tasks', errMsg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, router, showError]);

  // Initial load
  useEffect(() => {
    if (authStatus === 'authenticated') {
      setLoading(true);
      fetchTodos();
    }
  }, [authStatus, fetchTodos]);

  // Auto-refresh every 10 seconds for live updates
  useEffect(() => {
    if (authStatus !== 'authenticated' || loading) return;

    const interval = setInterval(() => {
      fetchTodos();
    }, 10000);

    return () => clearInterval(interval);
  }, [authStatus, loading, fetchTodos]);

  // Filtered todos
  const filteredTodos = statusFilter === 'ALL'
    ? todos
    : todos.filter((t) => t.status === statusFilter);

  // ── Render ──

  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
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
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="font-semibold text-lg tracking-tight hidden sm:inline">KarmaBoard</span>
            <Badge variant="secondary" className="ml-2 text-[10px]">Client Portal</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/profile">
                <Settings className="h-4 w-4 mr-1" />
                Profile
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/client/login' })}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto space-y-5 w-full">
        {/* Back + Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/client/portal">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{projectName || 'Project Tasks'}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                <ListTodo className="h-4 w-4" />
                Task Progress
                {lastUpdate && (
                  <span className="text-xs text-muted-foreground/70 ml-1">
                    &middot; Live &middot; Updated{' '}
                    {new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTodos(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Progress */}
        {summary && summary.total > 0 && (
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{summary.completionPercent}%</span>
                  <span className="text-sm text-muted-foreground">Complete</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="font-medium text-foreground">{summary.done}</span>
                    <span className="text-muted-foreground">Done</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="font-medium text-foreground">{summary.inProgress}</span>
                    <span className="text-muted-foreground">In Progress</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                    <span className="font-medium text-foreground">{summary.pending}</span>
                    <span className="text-muted-foreground">Pending</span>
                  </span>
                </div>
              </div>
              <Progress value={summary.completionPercent} className="h-3" />
            </CardContent>
          </Card>
        )}

        {/* Status Filter */}
        {summary && summary.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'ALL', label: 'All', count: summary.total },
              { key: 'IN_PROGRESS', label: 'In Progress', count: summary.inProgress },
              { key: 'PENDING', label: 'Pending', count: summary.pending },
              { key: 'DONE', label: 'Done', count: summary.done },
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={statusFilter === filter.key ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {filter.count}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredTodos.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <ListTodo className="h-10 w-10 text-muted-foreground mb-3" />
              {summary && summary.total === 0 ? (
                <>
                  <p className="text-sm font-medium">No tasks yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Tasks will appear here once your team adds them.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No tasks match this filter</p>
                  <p className="text-xs text-muted-foreground mt-1">Try selecting a different status filter.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Todo List */}
        {!loading && filteredTodos.length > 0 && (
          <div className="space-y-2">
            {filteredTodos.map((todo) => {
              const priority = priorityConfig[todo.priority] || priorityConfig.MEDIUM;
              const status = statusConfig[todo.status] || statusConfig.PENDING;
              const StatusIcon = status.icon;
              const isDone = todo.status === 'DONE';
              const overdue = isOverdue(todo.dueDate, todo.status);
              const dueDateStr = formatDueDate(todo.dueDate);

              return (
                <Card
                  key={todo.id}
                  className={`transition-all ${isDone ? 'opacity-60' : ''} ${overdue ? 'border-red-200 dark:border-red-800/40' : ''}`}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* Status Icon (read-only) */}
                      <div className="mt-0.5 shrink-0">
                        <StatusIcon className={`h-5 w-5 ${
                          isDone ? 'text-emerald-500' : todo.status === 'IN_PROGRESS' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'
                        }`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                          {todo.title}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priority.className}`}>
                            {priority.label}
                          </Badge>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${status.className}`}>
                            {status.label}
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
                            <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                              <Calendar className="h-3 w-3" />
                              {overdue && <AlertCircle className="h-3 w-3" />}
                              {dueDateStr}
                              {overdue && ' (Overdue)'}
                            </span>
                          )}
                        </div>

                        {/* Description (always visible for clients — read-only) */}
                        {todo.description && (
                          <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap leading-relaxed">
                            {todo.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Live indicator */}
        {!loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground/60">
            <Eye className="h-3.5 w-3.5" />
            Live updates — auto-refreshes every 10 seconds
          </div>
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