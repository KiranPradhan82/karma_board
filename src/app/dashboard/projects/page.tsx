"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROJECT_STATUSES } from "@/lib/constants";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  clientName: string | null;
  color: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  leadName: string | null;
  leadId: string | null;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  HIGH: { label: "High", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  LOW: { label: "Low", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  ON_HOLD: { label: "On Hold", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  COMPLETED: { label: "Completed", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  ARCHIVED: { label: "Archived", className: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400" },
};

export default function ProjectsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user as { role?: string; id?: string } | undefined;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    priority: "MEDIUM",
    clientName: "",
    color: "#6366f1",
    deadline: "",
  });

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sortBy,
        sortOrder: "desc",
      });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter && priorityFilter !== "all") params.set("priority", priorityFilter);

      const res = await fetch(`/api/projects?${params}`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.data.projects);
        setTotalPages(data.data.pagination.totalPages);
        setTotal(data.data.pagination.total);
      }
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter, sortBy]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, priorityFilter, sortBy]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          deadline: createForm.deadline || undefined,
          clientName: createForm.clientName || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Project created successfully");
        setCreateOpen(false);
        setCreateForm({ name: "", description: "", priority: "MEDIUM", clientName: "", color: "#6366f1", deadline: "" });
        fetchProjects();
        // Navigate to project detail to manage team
        router.push(`/dashboard/projects/${data.data.project.id}`);
      } else {
        toast.error(data.error || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`Are you sure you want to archive "${project.name}"?`)) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Project archived");
        fetchProjects();
      } else {
        toast.error(data.error || "Failed to archive project");
      }
    } catch {
      toast.error("Failed to archive project");
    }
  };

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function isOverdue(deadline: string | null, status: string) {
    if (!deadline || status === "COMPLETED" || status === "ARCHIVED") return false;
    return new Date(deadline) < new Date();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} project{total !== 1 ? "s" : ""} total
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(PROJECT_STATUSES).map(([key, val]) => (
              <SelectItem key={key} value={val}>
                {val.charAt(0) + val.slice(1).toLowerCase().replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Newest First</SelectItem>
            <SelectItem value="updatedAt">Recently Updated</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2 mb-6" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No projects found</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {search || (statusFilter && statusFilter !== "all") || (priorityFilter && priorityFilter !== "all")
                ? "Try adjusting your search or filters"
                : isAdmin
                  ? "Create your first project to get started"
                  : "No projects have been created yet"}
            </p>
            {isAdmin && !search && (!statusFilter || statusFilter === "all") && (!priorityFilter || priorityFilter === "all") && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Projects Grid */}
      {!loading && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const overdue = isOverdue(project.deadline, project.status);
            const priority = priorityConfig[project.priority] || priorityConfig.MEDIUM;
            const status = statusConfig[project.status] || statusConfig.ACTIVE;

            return (
              <Card
                key={project.id}
                className="group relative hover:shadow-md transition-shadow cursor-pointer border-l-4"
                style={{ borderLeftColor: project.color || "#6366f1" }}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              >
                <CardContent className="p-5">
                  {/* Top row: name + actions */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                      {project.clientName && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {project.clientName}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/projects/${project.id}`);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {isSuperAdmin && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(project);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Description */}
                  {project.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {project.description}
                    </p>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priority.className}`}>
                      {priority.label}
                    </Badge>
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${status.className}`}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Bottom row: deadline + team */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {project.deadline ? (
                        <>
                          <Calendar className="h-3.5 w-3.5" />
                          <span className={overdue ? "text-destructive font-medium" : ""}>
                            {formatDate(project.deadline)}
                          </span>
                          {overdue && <AlertCircle className="h-3 w-3 text-destructive" />}
                        </>
                      ) : (
                        <span>No deadline</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span>{project.memberCount}</span>
                    </div>
                  </div>

                  {/* Lead */}
                  {project.leadName && (
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Lead:</span> {project.leadName}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g., UK Store Website"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-desc">Description</Label>
              <Textarea
                id="project-desc"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Brief project description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="project-priority">Priority</Label>
                <Select
                  value={createForm.priority}
                  onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}
                >
                  <SelectTrigger id="project-priority">
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
                <Label htmlFor="project-deadline">Deadline</Label>
                <Input
                  id="project-deadline"
                  type="date"
                  value={createForm.deadline}
                  onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="project-client">Client Name</Label>
                <Input
                  id="project-client"
                  value={createForm.clientName}
                  onChange={(e) => setCreateForm({ ...createForm, clientName: e.target.value })}
                  placeholder="e.g., Acme Corp"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-color">Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="project-color"
                    type="color"
                    value={createForm.color}
                    onChange={(e) => setCreateForm({ ...createForm, color: e.target.value })}
                    className="w-10 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    value={createForm.color}
                    onChange={(e) => setCreateForm({ ...createForm, color: e.target.value })}
                    className="flex-1"
                    placeholder="#6366f1"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createLoading || !createForm.name.trim()}>
              {createLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
