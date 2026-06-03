'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, User, Hammer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useApiError } from '@/hooks/use-api-error';
import Link from 'next/link';

interface ClientProfile {
  id: string;
  name: string;
  email: string;
  company: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export default function ClientProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showError, ErrorDetailDialog } = useApiError();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company: '',
    address: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/clients/me');
        const data = await res.json();
        if (data.success) {
          setProfile(data.data);
          setForm({
            name: data.data.name || '',
            company: data.data.company || '',
            address: data.data.address || '',
            phone: data.data.phone || '',
          });
        } else {
          showError('Failed to load profile', data.error || 'Unknown error');
          toast.error('Failed to load profile');
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showError('Failed to load profile', errMsg, 'URL: /api/clients/me');
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name || form.name.length < 2) errs.name = 'Name must be at least 2 characters';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};
      if (form.name !== profile?.name) updateData.name = form.name;
      if (form.company !== (profile?.company || '')) updateData.company = form.company || null;
      if (form.address !== (profile?.address || '')) updateData.address = form.address || null;
      if (form.phone !== (profile?.phone || '')) updateData.phone = form.phone || null;

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes to save');
        return;
      }

      const res = await fetch('/api/clients/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Profile updated successfully');
        setProfile({ ...profile!, ...updateData } as ClientProfile);
      } else {
        showError('Failed to update profile', data.error || 'Unknown error', 'URL: PUT /api/clients/me');
        toast.error(data.error || 'Failed to update profile');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showError('Failed to update profile', errMsg, 'URL: PUT /api/clients/me');
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">KarmaBoard</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/client/login' })}>
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/client/portal">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your account information</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Details
              </CardTitle>
              <CardDescription>
                Update your personal information below
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="profile-name">Full Name *</Label>
                  <Input
                    id="profile-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your full name"
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    value={profile?.email || ''}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed. Contact your administrator for help.</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="profile-company">Company</Label>
                  <Input
                    id="profile-company"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Your company name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="profile-address">Address</Label>
                  <Input
                    id="profile-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Your address"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="profile-phone">Phone</Label>
                  <Input
                    id="profile-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Your phone number"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground pt-4">
            Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
          </div>
        </div>
      </main>

      {ErrorDetailDialog}
    </div>
  );
}
