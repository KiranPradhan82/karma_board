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
  Briefcase,
  Loader2,
  X,
  Mail,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useApiError } from '@/hooks/use-api-error';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INACTIVE: 'bg-gray-100 text-gray-600 border-gray-200',
};

/* ------------------------------------------------------------------ */
/*  Client Form Dialog                                                 */
/* ------------------------------------------------------------------ */

interface ClientFormData {
  name: string;
  email: string;
  company: string;
  address: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: ClientFormData = {
  name: '',
  email: '',
  company: '',
  address: '',
  phone: '',
  notes: '',
};

function ClientFormDialog({
  open,
  onOpenChange,
  mode,
  client,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  client: Client | null;
  onSubmit: (data: ClientFormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ClientFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === 'edit' && client) {
      setForm({
        name: client.name,
        email: client.email,
        company: client.company || '',
        address: client.address || '',
        phone: client.phone || '',
        notes: client.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [mode, client, open]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name || form.name.length < 2) errs.name = 'Name must be at least 2 characters';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Valid email is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setErrors({}); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add New Client' : 'Edit Client'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Create a new client account. A welcome email with temporary password will be sent.'
              : `Edit ${client?.name || 'client'} details.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Name *</Label>
            <Input
              id="client-name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-email">Email *</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="client@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={mode === 'edit'}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          {mode === 'add' && (
            <div className="rounded-lg border bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                A temporary password will be automatically generated and sent to the client&apos;s email. They will be required to change it on first login.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="client-company">Company</Label>
            <Input
              id="client-company"
              placeholder="Acme Corp"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-address">Address</Label>
            <Input
              id="client-address"
              placeholder="123 Main St, City, State"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-phone">Phone</Label>
            <Input
              id="client-phone"
              placeholder="+1 (555) 123-4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              placeholder="Internal notes about this client..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'add' ? 'Create Client' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Client Detail Dialog                                               */
/* ------------------------------------------------------------------ */

function ClientDetailDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
}) {
  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Client Details</DialogTitle>
          <DialogDescription>{client.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{client.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Company</p>
                <p className="font-medium">{client.company || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{client.phone || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge className={`mt-1 ${STATUS_STYLES[client.status] || ''}`} variant="outline">
                  {client.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Projects</p>
                <p className="font-medium">{client.projectCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Joined</p>
                <p className="font-medium">
                  {new Date(client.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {client.address && (
            <div className="text-sm">
              <p className="text-muted-foreground">Address</p>
              <p className="font-medium">{client.address}</p>
            </div>
          )}

          {client.notes && (
            <div className="text-sm">
              <p className="text-muted-foreground">Notes</p>
              <p className="font-medium">{client.notes}</p>
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

function ClientsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
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
        <Briefcase className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No clients found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {hasFilters
          ? 'No clients match your current filters. Try adjusting your search criteria.'
          : 'There are no clients yet. Add your first client to get started.'}
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
/*  Main Clients Page                                                  */
/* ------------------------------------------------------------------ */

export default function ClientsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || 'MEMBER';
  const { showError, ErrorDetailDialog } = useApiError();

  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Dialogs
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientDialogMode, setClientDialogMode] = useState<'add' | 'edit'>('add');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch clients
  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', pagination.page.toString());
      params.set('limit', pagination.limit.toString());
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/clients?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setClients(json.data.clients);
        setPagination(json.data.pagination);
      } else {
        showError('Failed to load clients', json.error || 'Unknown error', `URL: /api/clients?${params.toString()}`);
        toast.error(json.error || 'Failed to load clients');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to load clients', errMsg, `URL: /api/clients?${params.toString()}`);
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, pagination.page, pagination.limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [search, statusFilter, sortBy, sortOrder]);

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setSortBy('createdAt');
    setSortOrder('desc');
  }

  const hasActiveFilters = !!(search || statusFilter);

  // Create / Update
  async function handleFormSubmit(data: ClientFormData) {
    setDialogLoading(true);
    try {
      if (clientDialogMode === 'add') {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.success) {
          if (json.data.emailSent) {
            toast.success('Client created! A welcome email with temporary password has been sent.');
          } else {
            toast.success(`Client created! Email not sent: ${json.data.emailError || 'Unknown error'}`);
          }
          setClientDialogOpen(false);
          fetchClients();
        } else {
          showError('Failed to create client', json.error || 'Unknown error');
          toast.error(json.error || 'Failed to create client');
        }
      } else if (editingClient) {
        const updateData: Record<string, unknown> = {};
        if (data.name !== editingClient.name) updateData.name = data.name;
        if (data.company !== (editingClient.company || '')) updateData.company = data.company || null;
        if (data.address !== (editingClient.address || '')) updateData.address = data.address || null;
        if (data.phone !== (editingClient.phone || '')) updateData.phone = data.phone || null;
        if (data.notes !== (editingClient.notes || '')) updateData.notes = data.notes || null;

        if (Object.keys(updateData).length === 0) {
          toast.info('No changes to save');
          setClientDialogOpen(false);
          return;
        }

        const res = await fetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        const json = await res.json();
        if (json.success) {
          toast.success('Client updated successfully');
          setClientDialogOpen(false);
          fetchClients();
        } else {
          showError('Failed to update client', json.error || 'Unknown error', `URL: /api/clients/${editingClient.id}`);
          toast.error(json.error || 'Failed to update client');
        }
      }
    } catch (formError) {
      const errMsg = formError instanceof Error ? formError.message : String(formError);
      showError('Failed to save client', errMsg);
      toast.error(`Request failed: ${errMsg}`);
    } finally {
      setDialogLoading(false);
    }
  }

  // Delete
  async function handleDelete() {
    if (!deletingClient) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/clients/${deletingClient.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('Client deleted successfully');
        setDeleteDialogOpen(false);
        setDeletingClient(null);
        fetchClients();
      } else {
        showError('Failed to delete client', json.error || 'Unknown error', `URL: /api/clients/${deletingClient.id}`);
        toast.error(json.error || 'Failed to delete client');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to delete client', errMsg, `URL: /api/clients/${deletingClient?.id}`);
      toast.error('Something went wrong');
    } finally {
      setDeleteLoading(false);
    }
  }

  // Page navigation
  function goToPage(page: number) {
    setPagination((prev) => ({ ...prev, page }));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your clients and their project access.
          </p>
        </div>
        {userRole === 'SUPERADMIN' && (
          <Button
            onClick={() => {
              setClientDialogMode('add');
              setEditingClient(null);
              setClientDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, company..."
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
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="createdAt">Created</SelectItem>
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

      {/* Content */}
      {loading ? (
        <ClientsSkeleton />
      ) : clients.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((clientItem) => (
                  <TableRow key={clientItem.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{clientItem.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{clientItem.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{clientItem.company || '—'}</TableCell>
                    <TableCell className="text-sm">{clientItem.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[clientItem.status] || ''}`} variant="outline">
                        {clientItem.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{clientItem.projectCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions for {clientItem.name}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setDetailClient(clientItem); setDetailDialogOpen(true); }}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                          {userRole === 'SUPERADMIN' && (
                            <DropdownMenuItem onClick={() => {
                              setClientDialogMode('edit');
                              setEditingClient(clientItem);
                              setClientDialogOpen(true);
                            }}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                          )}
                          {userRole === 'SUPERADMIN' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { setDeletingClient(clientItem); setDeleteDialogOpen(true); }}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
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
            {clients.map((clientItem) => (
              <Card key={clientItem.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{clientItem.name}</p>
                      <p className="text-xs text-muted-foreground">{clientItem.email}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setDetailClient(clientItem); setDetailDialogOpen(true); }}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        {userRole === 'SUPERADMIN' && (
                          <DropdownMenuItem onClick={() => {
                            setClientDialogMode('edit');
                            setEditingClient(clientItem);
                            setClientDialogOpen(true);
                          }}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        {userRole === 'SUPERADMIN' && (
                          <DropdownMenuItem
                            onClick={() => { setDeletingClient(clientItem); setDeleteDialogOpen(true); }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[clientItem.status] || ''}`} variant="outline">
                      {clientItem.status}
                    </Badge>
                    {clientItem.company && (
                      <span className="text-xs text-muted-foreground">{clientItem.company}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {clientItem.projectCount} project{clientItem.projectCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => goToPage(pagination.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => goToPage(pagination.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Form Dialog */}
      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        mode={clientDialogMode}
        client={editingClient}
        onSubmit={handleFormSubmit}
        loading={dialogLoading}
      />

      {/* Detail Dialog */}
      <ClientDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        client={detailClient}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingClient?.name}</strong>?
              This will deactivate the client and unlink them from all projects. This action can be undone by re-creating the client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {ErrorDetailDialog}
    </div>
  );
}
