"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { errorToast } from "@/lib/error-toast";
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Loader2,
  AlertCircle,
  User,
  Calendar,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ── Types ──────────────────────────────────────────────

interface TodoItem {
  id: string;
  projectId: string;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeAvatar: string | null;
  createdByName: string | null;
}

interface TodoSummary {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  completionPercent: number;
}

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  user: {
    name: string;
    email: string;
    avatar: string | null;
    jobTitle: string | null;
    status: string;
  };
}

// ── Configs ────────────────────────────────────────────

const priorityConfig: Record<string, { label: string; className: string; dotColor: string }> = {
  HIGH: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", dotColor: "bg-red-500" },
  MEDIUM: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", dotColor: "bg-amber-500" },
  LOW: { label: "Low", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", dotColor: "bg-green-500" },
};

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType; nextStatus?: string }> = {
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400", icon: Circle, nextStatus: "IN_PROGRESS" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock, nextStatus: "DONE" },
  DONE: { label: "Done", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2, nextStatus: undefined },
};

// ── Component ──────────────────────────────────────────

interface ProjectTodosProps {
  projectId: string;
  team: TeamMember[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function ProjectTodos({ projectId, team, isAdmin, isSuperAdmin }: ProjectTodosProps) {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; role?: string } | undefined;

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [summary, setSummary] = useState<TodoSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [expandedTodo, setExpandedTodo] = useState<string | null>(null);

  // Add todo dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    priority: "MEDIUM",
    dueDate: "",
  });

  // Edit todo dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editTodoId, setEditTodoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    priority: "MEDIUM",
    dueDate: "",
    status: "PENDING",
  });

  const fetchTodos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (assigneeFilter !== "ALL") params.set("assigneeId", assigneeFilter);

      const res = await fetch(`/api/projects/${projectId}/todos?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        // If we have filters, we still need the unfiltered summary
        setTodos(data.data.todos);
        // Always fetch unfiltered summary
        const summaryRes = await fetch(`/api/projects/${projectId}/todos`);
        const summaryData = await summaryRes.json();
        if (summaryData.success) {
          setSummary(summaryData.data.summary);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, assigneeFilter]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // ── Handlers ──

  const handleToggleStatus = async (todo: TodoItem) => {
    const nextStatus = statusConfig[todo.status]?.nextStatus;
    if (!nextStatus) return; // Already DONE, no next

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, status: nextStatus } : t))
    );

    try {
      const res = await fetch(`/api/projects/${projectId}/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revert optimistic update
        setTodos((prev) =>
          prev.map((t) => (t.id === todo.id ? { ...t, status: todo.status } : t))
        );
        errorToast({ error: data.error, title: "Failed to update todo" });
      } else {
        // Re-fetch to get fresh summary
        fetchTodos();
        if (nextStatus === "DONE") {
          toast.success("Task marked as done");
        }
      }
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, status: todo.status } : t))
      );
      errorToast({ error: "Failed to update todo" });
    }
  };

  const handleAddTodo = async () => {
    if (!addForm.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title.trim(),
          description: addForm.description.trim() || null,
          assigneeId: addForm.assigneeId || null,
          priority: addForm.priority,
          dueDate: addForm.dueDate ? new Date(addForm.dueDate).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Task added");
        setAddOpen(false);
        setAddForm({ title: "", description: "", assigneeId: "", priority: "MEDIUM", dueDate: "" });
        fetchTodos();
      } else {
        errorToast({ error: data.error, title: "Failed to add task" });
      }
    } catch {
      errorToast({ error: "Failed to add task" });
    } finally {
      setAddLoading(false);
    }
  };

  const openEditDialog = (todo: TodoItem) => {
    setEditTodoId(todo.id);
    setEditForm({
      title: todo.title,
      description: todo.description || "",
      assigneeId: todo.assigneeId || "",
      priority: todo.priority,
      dueDate: todo.dueDate ? todo.dueDate.split("T")[0] : "",
      status: todo.status,
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTodoId || !editForm.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    setEditLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/todos/${editTodoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          assigneeId: editForm.assigneeId || null,
          priority: editForm.priority,
          dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
          status: editForm.status,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Task updated");
        setEditOpen(false);
        fetchTodos();
      } else {
        errorToast({ error: data.error, title: "Failed to update task" });
      }
    } catch {
      errorToast({ error: "Failed to update task" });
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTodo = async (todo: TodoItem) => {
    if (!confirm(`Delete "${todo.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/todos/${todo.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Task deleted");
        fetchTodos();
      } else {
        errorToast({ error: data.error, title: "Failed to delete task" });
      }
    } catch {
      errorToast({ error: "Failed to delete task" });
    }
  };

  const handleMoveTodo = async (todo: TodoItem, direction: "up" | "down") => {
    const sortedTodos = [...todos].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sortedTodos.findIndex((t) => t.id === todo.id);
    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= sortedTodos.length - 1) return;

    const swapWith = direction === "up" ? sortedTodos[idx - 1] : sortedTodos[idx + 1];

    // Optimistic swap
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id === todo.id) return { ...t, sortOrder: swapWith.sortOrder };
        if (t.id === swapWith.id) return { ...t, sortOrder: todo.sortOrder };
        return t;
      })
    );

    try {
      await fetch(`/api/projects/${projectId}/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapWith.sortOrder }),
      });
      await fetch(`/api/projects/${projectId}/todos/${swapWith.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: todo.sortOrder }),
      });
    } catch {
      // Revert
      fetchTodos();
    }
  };

  function formatDueDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch {
      return null;
    }
  }

  function isOverdue(dateStr: string | null, status: string) {
    if (!dateStr || status === "DONE") return false;
    return new Date(dateStr) < new Date();
  }

  // ── Render ──

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ListTodo className="h-5 w-5" />
          Project Todos
        </h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        )}
      </div>

      {/* Summary Progress */}
      {summary && summary.total > 0 && (
        <Card className="mb-4">
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
            <Progress value={summary.completionPercent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {summary && summary.total > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="DONE">Done</SelectItem>
            </SelectContent>
          </Select>

          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Members</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {team.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(statusFilter !== "ALL" || assigneeFilter !== "ALL") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setStatusFilter("ALL");
                setAssigneeFilter("ALL");
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && todos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-10">
            <ListTodo className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No tasks yet</p>
            <p className="text-xs text-muted-foreground mb-3">
              {(statusFilter !== "ALL" || assigneeFilter !== "ALL")
                ? "No tasks match the current filters"
                : "Create your first task to start tracking progress"}
            </p>
            {isAdmin && (statusFilter === "ALL" && assigneeFilter === "ALL") && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Task
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Todo List */}
      {!loading && todos.length > 0 && (
        <div className="space-y-2">
          {todos.map((todo) => {
            const priority = priorityConfig[todo.priority] || priorityConfig.MEDIUM;
            const status = statusConfig[todo.status] || statusConfig.PENDING;
            const StatusIcon = status.icon;
            const isDone = todo.status === "DONE";
            const overdue = isOverdue(todo.dueDate, todo.status);
            const dueDateStr = formatDueDate(todo.dueDate);
            const isExpanded = expandedTodo === todo.id;
            const canManage = isAdmin || isSuperAdmin;

            return (
              <Card
                key={todo.id}
                className={`transition-all ${isDone ? "opacity-60" : ""} ${
                  overdue ? "border-red-200 dark:border-red-800/40" : ""
                }`}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    {/* Checkbox / Status Toggle */}
                    <button
                      onClick={() => canManage && handleToggleStatus(todo)}
                      className={`mt-0.5 shrink-0 transition-colors ${
                        canManage ? "cursor-pointer hover:opacity-70" : "cursor-default"
                      }`}
                      disabled={!canManage}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : todo.status === "IN_PROGRESS" ? (
                        <Clock className="h-5 w-5 text-blue-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : ""}`}>
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

                        {/* Actions */}
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isDone && status.nextStatus && (
                                <DropdownMenuItem onClick={() => handleToggleStatus(todo)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  Mark as {status.nextStatus === "DONE" ? "Done" : "In Progress"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEditDialog(todo)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleMoveTodo(todo, "up")}
                                disabled={todos[0]?.id === todo.id}
                              >
                                <ChevronUp className="mr-2 h-4 w-4" />
                                Move Up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleMoveTodo(todo, "down")}
                                disabled={todos[todos.length - 1]?.id === todo.id}
                              >
                                <ChevronDown className="mr-2 h-4 w-4" />
                                Move Down
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isSuperAdmin && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDeleteTodo(todo)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {/* Expandable Description */}
                      {todo.description && (
                        <button
                          onClick={() => setExpandedTodo(isExpanded ? null : todo.id)}
                          className="text-xs text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              Hide details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              Show details
                            </>
                          )}
                        </button>
                      )}
                      {isExpanded && todo.description && (
                        <p className="text-sm text-muted-foreground mt-2 bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
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

      {/* Add Todo Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-title">Task Title *</Label>
              <Input
                id="add-title"
                placeholder="e.g., Design homepage mockup"
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && !addLoading && handleAddTodo()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-desc">Description</Label>
              <Textarea
                id="add-desc"
                placeholder="Detailed description of the task..."
                value={addForm.description}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="add-assignee">Assign To</Label>
                <Select value={addForm.assigneeId} onValueChange={(v) => setAddForm({ ...addForm, assigneeId: v })}>
                  <SelectTrigger id="add-assignee">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {team.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.user.name} ({m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-priority">Priority</Label>
                <Select value={addForm.priority} onValueChange={(v) => setAddForm({ ...addForm, priority: v })}>
                  <SelectTrigger id="add-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-due">Due Date</Label>
              <Input
                id="add-due"
                type="date"
                value={addForm.dueDate}
                onChange={(e) => setAddForm({ ...addForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTodo} disabled={addLoading || !addForm.title.trim()}>
              {addLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Todo Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Task Title *</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-assignee">Assign To</Label>
                <Select value={editForm.assigneeId} onValueChange={(v) => setEditForm({ ...editForm, assigneeId: v })}>
                  <SelectTrigger id="edit-assignee">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {team.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger id="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-due">Due Date</Label>
              <Input
                id="edit-due"
                type="date"
                value={editForm.dueDate}
                onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editForm.title.trim()}>
              {editLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}