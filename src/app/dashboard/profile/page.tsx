'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Briefcase,
  Phone,
  Tag,
  Lock,
  Loader2,
  Shield,
  Calendar,
  FolderKanban,
  Save,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileData {
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
  updatedAt: string;
  projectCount: number;
}

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

function parseSkills(skills: string | null | undefined): string[] {
  if (!skills) return [];
  try {
    return JSON.parse(skills);
  } catch {
    return skills.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

/* ------------------------------------------------------------------ */
/*  Profile Skeleton                                                   */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Page                                                       */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const userId = (session?.user as { id?: string })?.id || '';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form state
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [skillsInput, setSkillsInput] = useState('');

  // Password change dialog
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Fetch profile
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/members/me');
        const json = await res.json();
        if (json.success) {
          setProfile(json.data);
          setName(json.data.name);
          setJobTitle(json.data.jobTitle || '');
          setPhone(json.data.phone || '');
          setSkillsInput(parseSkills(json.data.skills).join(', '));
        } else {
          toast.error(json.error || 'Failed to load profile');
        }
      } catch {
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    if (userId) fetchProfile();
  }, [userId]);

  // Save profile
  async function handleSaveProfile() {
    setSaving(true);
    try {
      const skillsArr = skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const updateData: Record<string, unknown> = {};

      if (profile && name !== profile.name) updateData.name = name;
      if (profile && jobTitle !== (profile.jobTitle || '')) updateData.jobTitle = jobTitle || null;
      if (profile && phone !== (profile.phone || '')) updateData.phone = phone || null;
      const existingSkills = profile ? parseSkills(profile.skills) : [];
      if (JSON.stringify(skillsArr) !== JSON.stringify(existingSkills)) {
        updateData.skills = skillsArr.length > 0 ? JSON.stringify(skillsArr) : null;
      }

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/members/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const json = await res.json();

      if (json.success) {
        toast.success('Profile updated successfully');
        setProfile((prev) => prev ? { ...prev, ...json.data, jobTitle: json.data.jobTitle || null, phone: json.data.phone || null, skills: updateData.skills as string | null || prev.skills } : prev);

        // Update session so sidebar shows new name
        if (updateData.name) {
          await updateSession({ name: updateData.name as string });
        }
      } else {
        toast.error(json.error || 'Failed to update profile');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  // Change password
  async function handleChangePassword() {
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Password needs at least one letter and one number');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch('/api/members/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success('Password changed successfully');
        setPasswordDialogOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(json.error || 'Failed to change password');
      }
    } catch {
      setPasswordError('Something went wrong');
    } finally {
      setPasswordSaving(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">Could not load profile data.</p>
      </div>
    );
  }

  const skillsList = parseSkills(profile.skills);
  const hasChanges =
    name !== profile.name ||
    jobTitle !== (profile.jobTitle || '') ||
    phone !== (profile.phone || '') ||
    JSON.stringify(skillsInput.split(',').map((s) => s.trim()).filter(Boolean)) !== JSON.stringify(skillsList);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your personal information and account settings.
        </p>
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-2xl shrink-0">
              {getInitials(profile.name)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{profile.name}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Mail className="h-3.5 w-3.5" />
                {profile.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge className={`${ROLE_STYLES[profile.role] || ''}`} variant="outline">
                  <Shield className="h-3 w-3 mr-1" />
                  {profile.role}
                </Badge>
                <Badge className={`${STATUS_STYLES[profile.status] || ''}`} variant="outline">
                  {profile.status}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <FolderKanban className="h-3 w-3" />
                  {profile.projectCount} project{profile.projectCount !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Joined {profile.joinDate ? new Date(profile.joinDate).toLocaleDateString() : new Date(profile.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Fields */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-4 w-4" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your name and contact details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full Name</Label>
              <Input
                id="profile-name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email Address</Label>
              <Input
                id="profile-email"
                type="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed. Contact your superadmin if needed.
              </p>
            </div>

            {/* Job Title */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-jobtitle">
                <Briefcase className="h-3.5 w-3.5 inline mr-1" />
                Job Title
              </Label>
              <Input
                id="profile-jobtitle"
                placeholder="Software Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">
                <Phone className="h-3.5 w-3.5 inline mr-1" />
                Phone Number
              </Label>
              <Input
                id="profile-phone"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Skills & Security */}
        <div className="space-y-6">
          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Skills
              </CardTitle>
              <CardDescription>
                Add your skills to help with project assignments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-skills">Skills</Label>
                <Input
                  id="profile-skills"
                  placeholder="React, Node.js, TypeScript"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Separate skills with commas</p>
              </div>

              {/* Current skills preview */}
              {skillsList.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Current skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skillsList.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Security
              </CardTitle>
              <CardDescription>
                Change your password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => setPasswordDialogOpen(true)}
                className="w-full"
              >
                <Lock className="mr-2 h-4 w-4" />
                Change Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError('');
                }}
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min. 8 chars, letter + number"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError('');
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError('');
                }}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={passwordSaving}>
              {passwordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
