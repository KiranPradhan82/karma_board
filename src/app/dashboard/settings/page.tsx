'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  Mail,
  Key,
  User,
  Save,
  Loader2,
  Shield,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingItem {
  value: string;
  masked: boolean;
  updatedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Page                                                      */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || 'MEMBER';

  const [settings, setSettings] = useState<Record<string, SettingItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');

  // Track if API key has been changed (to know whether to keep existing or replace)
  const [apiKeyChanged, setApiKeyChanged] = useState(false);

  // Fetch settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success) {
          setSettings(json.data);

          const data = json.data as Record<string, SettingItem>;

          // Populate form with current values
          if (data.RESEND_API_KEY) {
            setApiKey(data.RESEND_API_KEY.value);
          }
          if (data.RESEND_FROM_EMAIL) {
            setFromEmail(data.RESEND_FROM_EMAIL.value);
          }
          if (data.RESEND_FROM_NAME) {
            setFromName(data.RESEND_FROM_NAME.value);
          }
        } else {
          toast.error(json.error || 'Failed to load settings');
        }
      } catch {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    if (userRole === 'SUPERADMIN') fetchSettings();
  }, [userRole]);

  // Save settings
  async function handleSave() {
    setSaving(true);
    try {
      const updateSettings: Record<string, string> = {};

      // Only update fields that have been changed
      if (apiKeyChanged && apiKey) {
        updateSettings.RESEND_API_KEY = apiKey;
      }
      if (fromEmail !== (settings.RESEND_FROM_EMAIL?.value || '')) {
        updateSettings.RESEND_FROM_EMAIL = fromEmail;
      }
      if (fromName !== (settings.RESEND_FROM_NAME?.value || '')) {
        updateSettings.RESEND_FROM_NAME = fromName;
      }

      if (Object.keys(updateSettings).length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updateSettings }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(json.message || 'Settings saved successfully');
        setApiKeyChanged(false);

        // Refresh settings
        const refreshRes = await fetch('/api/settings');
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) {
          setSettings(refreshJson.data);
          const data = refreshJson.data as Record<string, SettingItem>;
          // Keep current form values, just update the masked display
          if (data.RESEND_API_KEY && !apiKeyChanged) {
            setApiKey(data.RESEND_API_KEY.value);
          }
          if (data.RESEND_FROM_EMAIL) {
            setFromEmail(data.RESEND_FROM_EMAIL.value);
          }
          if (data.RESEND_FROM_NAME) {
            setFromName(data.RESEND_FROM_NAME.value);
          }
        }
      } else {
        toast.error(json.error || 'Failed to save settings');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function hasChanges(): boolean {
    return (
      apiKeyChanged ||
      fromEmail !== (settings.RESEND_FROM_EMAIL?.value || '') ||
      fromName !== (settings.RESEND_FROM_NAME?.value || '')
    );
  }

  if (userRole !== 'SUPERADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Only superadmins can access application settings.
        </p>
      </div>
    );
  }

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage application configuration and email service settings.
        </p>
      </div>

      {/* Email Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Service (Resend)
          </CardTitle>
          <CardDescription>
            Configure the email service used to send welcome emails and notifications to team members.
            Settings are stored in the database and take effect immediately — no redeployment needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Info alert */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Changes to these settings take effect immediately for the next member creation.
              You can also set these as environment variables on Vercel as fallbacks.
            </AlertDescription>
          </Alert>

          <Separator />

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key" className="flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" />
              API Key
            </Label>
            <Input
              id="api-key"
              type="password"
              placeholder="re_xxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyChanged(true);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Your Resend API key. This is encrypted in the database and never sent to the browser in plain text.
              {settings.RESEND_API_KEY?.updatedAt && (
                <span className="block mt-1">
                  Last updated: {new Date(settings.RESEND_API_KEY.updatedAt).toLocaleString()}
                </span>
              )}
            </p>
            {settings.RESEND_API_KEY && !apiKeyChanged && (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> API key is configured
              </p>
            )}
          </div>

          {/* From Email */}
          <div className="space-y-1.5">
            <Label htmlFor="from-email">
              From Email
            </Label>
            <Input
              id="from-email"
              type="email"
              placeholder="noreply@yourdomain.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The email address that appears as the sender. Must be verified in your Resend dashboard.
            </p>
          </div>

          {/* From Name */}
          <div className="space-y-1.5">
            <Label htmlFor="from-name">
              <User className="h-3.5 w-3.5 inline mr-1" />
              From Name
            </Label>
            <Input
              id="from-name"
              placeholder="KarmaBoard"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The display name shown in the &quot;From&quot; field of sent emails.
            </p>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || !hasChanges()}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Environment Variable Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Environment Variable Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs space-y-2 text-muted-foreground">
            <p>
              The database settings above override these environment variables. If no value is set in the database,
              the system falls back to these env vars:
            </p>
            <div className="grid gap-2 sm:grid-cols-2 font-mono text-[11px]">
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_API_KEY</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_FROM_EMAIL</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_FROM_NAME</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">SETTINGS_ENCRYPTION_KEY</span>
              </div>
            </div>
            <p>
              <strong className="text-foreground/70">SETTINGS_ENCRYPTION_KEY</strong> is used to encrypt
              sensitive values in the database. It&apos;s auto-generated but you can set a custom one.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
