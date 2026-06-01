'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Users,
  Loader2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  skills?: string | null;
  status: string;
  joinDate?: string | null;
  createdAt: string;
  projectCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Role / Status badge helpers                                        */
/* ------------------------------------------------------------------ */

const ROLE_STYLES: Record<string, string> = {
  SUPERADMIN: 'bg-red-100 text-red-700 border-red-200',
  ADMIN: 'bg-amber-100 text-amber-700 border-amber-200',
  MEMBER: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INACTIVE: 'bg-gray-100 text-gray-600 border-gray-200',
  ON_LEAVE: 'bg-sky-100 text-sky-700 border-sky-200',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function parseSkills(skills: string | null | undefined): string[] {
  if (!skills) return [];
  try {
    return JSON.parse(skills);
  } catch {
    return skills.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

/* ------------------------------------------------------------------ */
/*  Member Form Dialog (Add / Edit)                                    */
/* ------------------------------------------------------------------ */

interface MemberFormData {
  name: string;
  email: string;
  password: string;
  jobTitle: string;
  phone: string;
  skills: string;
  role: string;
  status: string;
}

const EMPTY_FORM: MemberFormData = {
  name: '',
  email: '',
  password: '',
  jobTitle: '',
  phone: '',
  skills: '',
  role: 'MEMBER',
  status: 'ACTIVE',
};

function MemberDialog({
  open,
  onOpenChange,
  mode,
  member,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  member: Member | null;
  onSubmit: (data: MemberFormData) => void;
  loading: boolean;
}) {
  const dialogKey = `${mode}-${member?.id || 'new'}`;

  return open ? (
    <div key={dialogKey}>
      <MemberDialogInner
        mode={mode}
        member={member}
        onSubmit={onSubmit}
        loading={loading}
        onClose={() => onOpenChange(false)}
      />
    </div>
  ) : null;
}

function MemberDialogInner({
  mode,
  member,
  onSubmit,
  loading,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  member: Member | null;
  onSubmit: (data: MemberFormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<MemberFormData>(() => {
    if (mode === 'edit' && member) {
      return {
        name: member.name,
        email: member.email,
        password: '',
        jobTitle: member.jobTitle || '',
        phone: member.phone || '',
        skills: parseSkills(member.skills).join(', '),
        role: member.role,
        status: member.status,
      };
    }
    return EMPTY_FORM;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});


  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name || form.name.length < 2) errs.name = 'Name must be at least 2 characters';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Valid email is required';
    if (mode === 'add') {
      if (!form.password || form.password.length < 8) errs.password = 'Password must be at least 8 characters';
      if (!/[a-zA-Z]/.test(form.password)) errs.password = 'Password needs at least one letter';
      if (!/[0-9]/.test(form.password)) errs.password = 'Password needs at least one number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(form);
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add New Member' : 'Edit Member'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Create a new team member account.'
              : `Edit ${member?.name || 'member'} details.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={mode === 'edit'}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          {/* Password (create only) */}
          {mode === 'add' && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 chars, letter + number"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>
          )}

          {/* Job Title */}
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              placeholder="Software Engineer"
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="+1 (555) 123-4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          {/* Skills */}
          <div className="space-y-1.5">
            <Label htmlFor="skills">Skills</Label>
            <Input
              id="skills"
              placeholder="React, Node.js, TypeScript"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Separate skills with commas</p>
          </div>

          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'edit' && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'add' ? 'Create Member' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Member Detail Dialog                                               */
/* ------------------------------------------------------------------ */

function MemberDetailDialog({
  open,
  onOpenChange,
  member,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Member | null;
  onClose: () => void;
}) {
  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Member Details</DialogTitle>
          <DialogDescription>{member.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-lg">{member.name}</p>
              <p className="text-sm text-muted-foreground">{member.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Role</p>
              <Badge className={`mt-1 ${ROLE_STYLES[member.role] || ''}`} variant="outline">
                {member.role}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge className={`mt-1 ${STATUS_STYLES[member.status] || ''}`} variant="outline">
                {member.status}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Job Title</p>
              <p className="mt-1 font-medium">{member.jobTitle || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Phone</p>
              <p className="mt-1 font-medium">{member.phone || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Projects</p>
              <p className="mt-1 font-medium">{member.projectCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Joined</p>
              <p className="mt-1 font-medium">
                {member.joinDate
                  ? new Date(member.joinDate).toLocaleDateString()
                  : new Date(member.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {parseSkills(member.skills).length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {parseSkills(member.skills).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function TeamSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No members found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {hasFilters
          ? 'No members match your current filters. Try adjusting your search criteria.'
          : 'There are no team members yet. Add your first team member to get started.'}
      </p>
      {hasFilters ? (
        <Button variant="outline" className="mt-4" onClick={onClearFilters}>
          <X className="mr-2 h-4 w-4" /> Clear Filters
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Card                                                        */
/* ------------------------------------------------------------------ */

function MemberCard({
  member,
  selected,
  canEdit,
  isOwn,
  onToggleSelect,
  onEdit,
  onDelete,
  onView,
}: {
  member: Member;
  selected: boolean;
  canEdit: boolean;
  isOwn: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  return (
    <Card className="relative">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            className="mt-1"
            aria-label={`Select ${member.name}`}
          />
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="text-sm bg-primary/10 text-primary font-medium">
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{member.name}</p>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onView}>
                    <Eye className="mr-2 h-4 w-4" /> View Details
                  </DropdownMenuItem>
                  {canEdit && !isOwn && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  {isOwn && (
                    <DropdownMenuItem asChild>
                      <a href="/dashboard/profile">
                        <Pencil className="mr-2 h-4 w-4" /> Edit My Profile
                      </a>
                    </DropdownMenuItem>
                  )}
                  {canEdit && !isOwn && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_STYLES[member.role] || ''}`} variant="outline">
                {member.role}
              </Badge>
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[member.status] || ''}`} variant="outline">
                {member.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {member.projectCount} project{member.projectCount !== 1 ? 's' : ''}
              </span>
            </div>
            {member.jobTitle && (
              <p className="text-xs text-muted-foreground mt-1">{member.jobTitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Team Page                                                     */
/* ------------------------------------------------------------------ */

export default function TeamPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || 'MEMBER';
  const userId = (session?.user as { id?: string })?.id || '';
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
  const isSuperAdmin = userRole === 'SUPERADMIN';

  // State
  const [members, setMembers] = useState<Member[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberDialogMode, setMemberDialogMode] = useState<'add' | 'edit'>('add');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('role', roleFilter);
      params.set('page', pagination.page.toString());
      params.set('limit', pagination.limit.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/members?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setMembers(json.data.members);
        setPagination(json.data.pagination);
      } else {
        toast.error(json.error || 'Failed to load members');
      }
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, roleFilter, pagination.page, pagination.limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [search, statusFilter, roleFilter, sortBy, sortOrder]);

  // Clear filters
  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setRoleFilter('');
    setSortBy('createdAt');
    setSortOrder('desc');
  }

  const hasActiveFilters = !!(search || statusFilter || roleFilter);

  // Selection
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === members.length && members.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map((m) => m.id)));
    }
  }

  // Create / Update
  async function handleFormSubmit(data: MemberFormData) {
    setDialogLoading(true);
    try {
      // Convert skills to JSON array
      const skillsArr = data.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (memberDialogMode === 'add') {
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            skills: skillsArr.length > 0 ? JSON.stringify(skillsArr) : null,
          }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success('Member created successfully');
          setMemberDialogOpen(false);
          fetchMembers();
        } else {
          toast.error(json.error || 'Failed to create member');
        }
      } else if (editingMember) {
        const updateData: Record<string, unknown> = {};
        if (data.name !== editingMember.name) updateData.name = data.name;
        if (data.jobTitle !== (editingMember.jobTitle || '')) updateData.jobTitle = data.jobTitle || null;
        if (data.phone !== (editingMember.phone || '')) updateData.phone = data.phone || null;
        const existingSkills = parseSkills(editingMember.skills);
        if (JSON.stringify(skillsArr) !== JSON.stringify(existingSkills)) {
          updateData.skills = skillsArr.length > 0 ? JSON.stringify(skillsArr) : null;
        }
        if (data.role !== editingMember.role) updateData.role = data.role;
        if (data.status !== editingMember.status) updateData.status = data.status;

        if (Object.keys(updateData).length === 0) {
          toast.info('No changes to save');
          setMemberDialogOpen(false);
          return;
        }

        const res = await fetch(`/api/members/${editingMember.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        const json = await res.json();
        if (json.success) {
          toast.success('Member updated successfully');
          setMemberDialogOpen(false);
          fetchMembers();
        } else {
          toast.error(json.error || 'Failed to update member');
        }
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDialogLoading(false);
    }
  }

  // Delete single
  async function handleDelete() {
    if (!deletingMember) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/members/${deletingMember.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('Member deleted successfully');
        setDeleteDialogOpen(false);
        setDeletingMember(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deletingMember.id);
          return next;
        });
        fetchMembers();
      } else {
        toast.error(json.error || 'Failed to delete member');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDeleteLoading(false);
    }
  }

  // Bulk delete
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      const res = await fetch('/api/members/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Deleted ${json.data.deleted} member(s) successfully`);
        setBulkDeleteDialogOpen(false);
        setSelectedIds(new Set());
        fetchMembers();
      } else {
        toast.error(json.error || 'Failed to delete members');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setBulkDeleteLoading(false);
    }
  }

  // Page navigation
  function goToPage(page: number) {
    setPagination((prev) => ({ ...prev, page }));
  }

  // Render pagination numbers
  function renderPageNumbers() {
    const pages: number[] = [];
    const { totalPages, page: current } = pagination;
    const maxVisible = 5;

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your team members, roles, and permissions.
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => {
                setMemberDialogMode('add');
                setEditingMember(null);
                setMemberDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="ON_LEAVE">On Leave</SelectItem>
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="MEMBER">Member</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="joinDate">Join Date</SelectItem>
              <SelectItem value="role">Role</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            {isSuperAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <TeamSkeleton />
        ) : members.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === members.length && members.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all members"
                      />
                    </TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} data-selected={selectedIds.has(member.id)}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(member.id)}
                          onCheckedChange={() => toggleSelect(member.id)}
                          aria-label={`Select ${member.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate max-w-[180px]">{member.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{member.email}</p>
                            {member.jobTitle && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{member.jobTitle}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_STYLES[member.role] || ''}`} variant="outline">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[member.status] || ''}`} variant="outline">
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{member.projectCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {parseSkills(member.skills).slice(0, 3).map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {skill}
                            </Badge>
                          ))}
                          {parseSkills(member.skills).length > 3 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-default">
                                  +{parseSkills(member.skills).length - 3}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {parseSkills(member.skills).slice(3).join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions for {member.name}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setDetailMember(member); setDetailDialogOpen(true); }}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            {/* Edit/Delete: Only superadmin can edit OTHER members */}
                            {isSuperAdmin && member.id !== userId && (
                              <DropdownMenuItem onClick={() => {
                                setMemberDialogMode('edit');
                                setEditingMember(member);
                                setMemberDialogOpen(true);
                              }}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && member.id !== userId && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => { setDeletingMember(member); setDeleteDialogOpen(true); }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                            {/* Show "Go to Profile" for own row */}
                            {member.id === userId && (
                              <DropdownMenuItem asChild>
                                <a href="/dashboard/profile">
                                  <Pencil className="mr-2 h-4 w-4" /> Edit My Profile
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.size === members.length && members.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all members"
                />
                <span className="text-sm text-muted-foreground">Select all</span>
              </div>
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  selected={selectedIds.has(member.id)}
                  canEdit={isSuperAdmin}
                  isOwn={member.id === userId}
                  onToggleSelect={() => toggleSelect(member.id)}
                  onEdit={() => {
                    setMemberDialogMode('edit');
                    setEditingMember(member);
                    setMemberDialogOpen(true);
                  }}
                  onDelete={() => {
                    setDeletingMember(member);
                    setDeleteDialogOpen(true);
                  }}
                  onView={() => {
                    setDetailMember(member);
                    setDetailDialogOpen(true);
                  }}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={pagination.page <= 1}
                    onClick={() => goToPage(pagination.page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {renderPageNumbers().map((page) => (
                    <Button
                      key={page}
                      variant={pagination.page === page ? 'default' : 'outline'}
                      size="icon"
                      className="h-8 w-8 text-xs"
                      onClick={() => goToPage(page)}
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => goToPage(pagination.page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Add/Edit Dialog */}
        <MemberDialog
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
          mode={memberDialogMode}
          member={editingMember}
          onSubmit={handleFormSubmit}
          loading={dialogLoading}
        />

        {/* Detail Dialog */}
        <MemberDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          member={detailMember}
          onClose={() => setDetailMember(null)}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Member</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deletingMember?.name}</strong>? This action will
                soft-delete the member and remove them from all projects. They can be restored later by a superadmin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={deleteLoading}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Selected Members</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{selectedIds.size} member(s)</strong>? This will
                soft-delete them and remove them from all projects. This action can only be undone by a superadmin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleteLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleBulkDelete();
                }}
                disabled={bulkDeleteLoading}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {bulkDeleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete {selectedIds.size} Member(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
