"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  UserPlus,
  Shield,
  Calendar,
  Users,
  Loader2,
  MoreHorizontal,
  Crown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

const projectRoleLabels: Record<string, string> = {
  LEAD: "Team Lead",
  DEVELOPER: "Developer",
  MARKETER: "Marketer",
  VIEWER: "Viewer",
  MEMBER: "Member",
};

const projectRoleColors: Record<string, string> = {
  LEAD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  DEVELOPER: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  MARKETER: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  VIEWER: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
  MEMBER: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

interface ProjectDetail {
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
}

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  assignedBy: string | null;
  assignedByName?: string;
  user: {
    name: string;
    email: string;
    avatar: string | null;
    jobTitle: string | null;
    status: string;
  };
}

interface AvailableMember {
  id: string;
  name: string;
  email: string;
  role: string; // global role
  jobTitle: string | null;
}

export default function ProjectDetailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const user = session?.user as { role?: string; id?: string } | undefined;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit project dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    priority: "MEDIUM",
    status: "ACTIVE",
    clientName: "",
    color: "#6366f1",
    deadline: "",
  });

  // Add member dialog
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("MEMBER");
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProject(data.data.project);
      } else {
        toast.error(data.error || "Failed to load project");
        router.push("/dashboard/projects");
      }
    } catch {
      toast.error("Failed to load project");
      router.push("/dashboard/projects");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/team`);
      const data = await res.json();
      if (data.success) {
        setTeam(data.data.members);
      }
    } catch {
      // Silently fail — team data is secondary
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    fetchProject();
    fetchTeam();
  }, [fetchProject, fetchTeam]);

  const handleEditSave = async () => {
    if (!editForm.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setEditLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        description: editForm.description || null,
        priority: editForm.priority,
        status: editForm.status,
        clientName: editForm.clientName || null,
        color: editForm.color,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Project updated");
        setEditOpen(false);
        fetchProject();
      } else {
        toast.error(data.error || "Failed to update project");
      }
    } catch {
      toast.error("Failed to update project");
    } finally {
      setEditLoading(false);
    }
  };

  const openEditDialog = () => {
    if (!project) return;
    setEditForm({
      name: project.name,
      description: project.description || "",
      priority: project.priority,
      status: project.status,
      clientName: project.clientName || "",
      color: project.color || "#6366f1",
      deadline: project.deadline ? project.deadline.split("T")[0] : "",
    });
    setEditOpen(true);
  };

  const openAddMemberDialog = async () => {
    setAddMemberOpen(true);
    setSelectedUserId("");
    setSelectedRole("MEMBER");
    setLoadingMembers(true);
    try {
      // Fetch all active members (not deleted)
      const res = await fetch("/api/members?limit=200&status=ACTIVE");
      const data = await res.json();
      if (data.success) {
        // Filter out members already in this project
        const existingIds = new Set(team.map((m) => m.userId));
        const available = data.data.members.filter(
          (m: AvailableMember) => !existingIds.has(m.id)
        );
        setAvailableMembers(available);
      }
    } catch {
      toast.error("Failed to load available members");
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      toast.error("Please select a team member");
      return;
    }
    setAddMemberLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Team member added");
        setAddMemberOpen(false);
        fetchTeam();
        fetchProject(); // Update member count
      } else {
        toast.error(data.error || "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (member.role === "LEAD" && !isSuperAdmin) {
      toast.error("Only super admin can remove a team lead");
      return;
    }
    if (!confirm(`Remove ${member.user.name} from this project?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Member removed");
        fetchTeam();
        fetchProject();
      } else {
        toast.error(data.error || "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: string) => {
    // When assigning LEAD, check if there's already a lead
    if (newRole === "LEAD") {
      const existingLead = team.find((m) => m.role === "LEAD" && m.userId !== member.userId);
      if (existingLead) {
        toast.error("This project already has a team lead. Remove the current lead first.");
        return;
      }
    }
    // Only ADMIN+ global role can be LEAD in a project
    // Fetch the user's global role from the server (availableMembers may not be loaded)
    try {
      const memberRes = await fetch(`/api/members/${member.userId}`);
      const memberData = await memberRes.json();
      if (memberData.success && newRole === "LEAD") {
        const globalRole = memberData.data.role;
        if (globalRole !== "ADMIN" && globalRole !== "SUPERADMIN") {
          toast.error("Only admins can be assigned as Team Lead");
          return;
        }
      }
    } catch {
      // If fetch fails, let the backend handle the validation
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/team/${member.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Role updated");
        fetchTeam();
      } else {
        toast.error(data.error || "Failed to change role");
      }
    } catch {
      toast.error("Failed to change role");
    }
  };

  const handleArchive = async () => {
    if (!project || !confirm(`Archive "${project.name}"?`)) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Project archived");
        router.push("/dashboard/projects");
      } else {
        toast.error(data.error || "Failed to archive project");
      }
    } catch {
      toast.error("Failed to archive project");
    }
  };

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
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

  function isOverdue() {
    if (!project?.deadline || project.status === "COMPLETED" || project.status === "ARCHIVED") return false;
    return new Date(project.deadline) < new Date();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="link" onClick={() => router.push("/dashboard/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const overdue = isOverdue();
  const priority = priorityConfig[project.priority] || priorityConfig.MEDIUM;
  const status = statusConfig[project.status] || statusConfig.ACTIVE;
  const lead = team.find((m) => m.role === "LEAD");
  const otherMembers = team.filter((m) => m.role !== "LEAD");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: project.color || "#6366f1" }}
            />
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {isSuperAdmin && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={handleArchive}>
                <Trash2 className="mr-2 h-4 w-4" />
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <Badge variant="secondary" className={status.className}>
              {status.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Priority</p>
            <Badge variant="secondary" className={priority.className}>
              {priority.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Deadline</p>
            <p className={`text-sm font-medium ${overdue ? "text-destructive" : ""}`}>
              {formatDate(project.deadline)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Team Size</p>
            <p className="text-sm font-medium">{project.memberCount} member{project.memberCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Description + Client Info */}
      <Card>
        <CardContent className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Description</p>
              <p className="text-sm">{project.description || "No description provided"}</p>
            </div>
            <div className="space-y-3">
              {project.clientName && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Client</p>
                  <p className="text-sm">{project.clientName}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Created</p>
                <p className="text-sm">{formatDate(project.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Last Updated</p>
                <p className="text-sm">{formatDate(project.updatedAt)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Management */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Project Team
          </h2>
          {isAdmin && (
            <Button size="sm" onClick={openAddMemberDialog}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          )}
        </div>

        {/* Team Lead */}
        <Card className="mb-4 border-purple-200 dark:border-purple-800/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Crown className="h-4 w-4 text-purple-600" />
              Team Lead
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {lead ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {lead.user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{lead.user.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.user.email}</p>
                  </div>
                </div>
                {isSuperAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleRemoveMember(lead)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remove Lead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No team lead assigned.
                {isAdmin && " Add a lead from the available members below."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        {otherMembers.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherMembers.map((member) => (
              <Card key={member.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs">
                          {member.user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isSuperAdmin && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveMember(member)}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="mt-3">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${projectRoleColors[member.role] || ""}`}
                    >
                      {projectRoleLabels[member.role] || member.role}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-8">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {lead ? "No other team members" : "No team members yet"}
              </p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="mt-3" onClick={openAddMemberDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Team Member
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Project Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select
                  value={editForm.priority}
                  onValueChange={(v) => setEditForm({ ...editForm, priority: v })}
                >
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
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-client">Client Name</Label>
                <Input
                  id="edit-client"
                  value={editForm.clientName}
                  onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-deadline">Deadline</Label>
                <Input
                  id="edit-deadline"
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-color"
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  className="w-10 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editForm.name.trim()}>
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

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="select-member">Select Member *</Label>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No available members to add.</p>
              ) : (
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="select-member">
                    <SelectValue placeholder="Choose a member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Admins first (eligible for lead), then members */}
                    <SelectItem value="admins-header" disabled>
                      ── Admins (can be Lead) ──
                    </SelectItem>
                    {availableMembers
                      .filter((m) => m.role === "ADMIN" || m.role === "SUPERADMIN")
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </SelectItem>
                      ))}
                    {availableMembers.some((m) => m.role === "MEMBER") && (
                      <SelectItem value="members-header" disabled>
                        ── Members ──
                      </SelectItem>
                    )}
                    {availableMembers
                      .filter((m) => m.role === "MEMBER")
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="select-role">Project Role *</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* LEAD only available if selected user is ADMIN/SUPERADMIN */}
                  {(() => {
                    const selected = availableMembers.find((m) => m.id === selectedUserId);
                    const canBeLead = selected && (selected.role === "ADMIN" || selected.role === "SUPERADMIN");
                    return (
                      <>
                        <SelectItem value="LEAD" disabled={!canBeLead}>
                          {projectRoleLabels.LEAD}
                          {!canBeLead && " (Admins only)"}
                        </SelectItem>
                        <SelectItem value="DEVELOPER">{projectRoleLabels.DEVELOPER}</SelectItem>
                        <SelectItem value="MARKETER">{projectRoleLabels.MARKETER}</SelectItem>
                        <SelectItem value="VIEWER">{projectRoleLabels.VIEWER}</SelectItem>
                        <SelectItem value="MEMBER">{projectRoleLabels.MEMBER}</SelectItem>
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only one team lead per project. Leads must be admins.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={addMemberLoading || !selectedUserId}
            >
              {addMemberLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add to Team"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
