"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Mail,
  Key,
  User,
  Save,
  Loader2,
  Shield,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const userRole = (session?.user as { role?: string })?.role || "MEMBER";

  const [settings, setSettings] = useState<Record<string, SettingItem>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [emailProvider, setEmailProvider] = useState<string>("gmail-smtp");
  const [resendApiKey, setResendApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");

  // Track changes to sensitive fields
  const [resendKeyChanged, setResendKeyChanged] = useState(false);
  const [smtpPassChanged, setSmtpPassChanged] = useState(false);

  // Fetch settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (json.success) {
          setSettings(json.data);
          const data = json.data as Record<string, SettingItem>;

          if (data.EMAIL_PROVIDER) setEmailProvider(data.EMAIL_PROVIDER.value);
          if (data.RESEND_API_KEY) setResendApiKey(data.RESEND_API_KEY.value);
          if (data.RESEND_FROM_EMAIL) setFromEmail(data.RESEND_FROM_EMAIL.value);
          if (data.RESEND_FROM_NAME) setFromName(data.RESEND_FROM_NAME.value);
          if (data.SMTP_USER) setSmtpUser(data.SMTP_USER.value);
          if (data.SMTP_PASSWORD) setSmtpPassword(data.SMTP_PASSWORD.value);
        } else {
          toast.error(json.error || "Failed to load settings");
        }
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    if (userRole === "SUPERADMIN") fetchSettings();
  }, [userRole]);

  // Save settings
  async function handleSave() {
    setSaving(true);
    try {
      const updateSettings: Record<string, string> = {};

      if (emailProvider !== (settings.EMAIL_PROVIDER?.value || "")) {
        updateSettings.EMAIL_PROVIDER = emailProvider;
      }
      if (resendKeyChanged && resendApiKey) {
        updateSettings.RESEND_API_KEY = resendApiKey;
      }
      if (fromEmail !== (settings.RESEND_FROM_EMAIL?.value || "")) {
        updateSettings.RESEND_FROM_EMAIL = fromEmail;
      }
      if (fromName !== (settings.RESEND_FROM_NAME?.value || "")) {
        updateSettings.RESEND_FROM_NAME = fromName;
      }
      if (smtpUser !== (settings.SMTP_USER?.value || "")) {
        updateSettings.SMTP_USER = smtpUser;
      }
      if (smtpPassChanged && smtpPassword) {
        updateSettings.SMTP_PASSWORD = smtpPassword;
      }

      if (Object.keys(updateSettings).length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: updateSettings }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(json.message || "Settings saved successfully");
        setResendKeyChanged(false);
        setSmtpPassChanged(false);

        // Refresh settings
        const refreshRes = await fetch("/api/settings");
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) {
          setSettings(refreshJson.data);
          const data = refreshJson.data as Record<string, SettingItem>;
          if (data.RESEND_API_KEY && !resendKeyChanged) setResendApiKey(data.RESEND_API_KEY.value);
          if (data.RESEND_FROM_EMAIL) setFromEmail(data.RESEND_FROM_EMAIL.value);
          if (data.RESEND_FROM_NAME) setFromName(data.RESEND_FROM_NAME.value);
          if (data.EMAIL_PROVIDER) setEmailProvider(data.EMAIL_PROVIDER.value);
          if (data.SMTP_USER) setSmtpUser(data.SMTP_USER.value);
          if (data.SMTP_PASSWORD && !smtpPassChanged) setSmtpPassword(data.SMTP_PASSWORD.value);
        }
      } else {
        toast.error(json.error || "Failed to save settings");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function hasChanges(): boolean {
    return (
      emailProvider !== (settings.EMAIL_PROVIDER?.value || "") ||
      resendKeyChanged ||
      fromEmail !== (settings.RESEND_FROM_EMAIL?.value || "") ||
      fromName !== (settings.RESEND_FROM_NAME?.value || "") ||
      smtpUser !== (settings.SMTP_USER?.value || "") ||
      smtpPassChanged
    );
  }

  if (userRole !== "SUPERADMIN") {
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

  const isGmail = emailProvider === "gmail-smtp";

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
            Email Service
          </CardTitle>
          <CardDescription>
            Configure how KarmaBoard sends emails (welcome emails, notifications).
            Settings are stored encrypted in the database and take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Info alert */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Changes take effect immediately for the next member creation. No redeployment needed.
            </AlertDescription>
          </Alert>

          <Separator />

          {/* Provider Selector */}
          <div className="space-y-1.5">
            <Label>Email Provider</Label>
            <Select value={emailProvider} onValueChange={setEmailProvider}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail-smtp">
                  Gmail SMTP (testing — no domain needed)
                </SelectItem>
                <SelectItem value="resend">
                  Resend (production — requires a domain)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Use <strong>Gmail SMTP</strong> for testing with your Gmail account.
              Switch to <strong>Resend</strong> when you have a custom domain.
            </p>
          </div>

          <Separator />

          {/* From Name — shared by both providers */}
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

          {isGmail ? (
            /* ========== Gmail SMTP Fields ========== */
            <>
              {/* Gmail Address */}
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Gmail Address
                </Label>
                <Input
                  id="smtp-user"
                  type="email"
                  placeholder="yourname@gmail.com"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your Gmail address. This will be both the sender and SMTP login.
                </p>
              </div>

              {/* App Password */}
              <div className="space-y-1.5">
                <Label htmlFor="smtp-password" className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" />
                  Gmail App Password
                </Label>
                <Input
                  id="smtp-password"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={smtpPassword}
                  onChange={(e) => {
                    setSmtpPassword(e.target.value);
                    setSmtpPassChanged(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Create one at{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary"
                  >
                    Google App Passwords
                  </a>
                  . Use the 16-character code (remove spaces). This is encrypted in the database.
                  {settings.SMTP_PASSWORD?.updatedAt && (
                    <span className="block mt-1">
                      Last updated:{" "}
                      {new Date(settings.SMTP_PASSWORD.updatedAt).toLocaleString()}
                    </span>
                  )}
                </p>
                {settings.SMTP_PASSWORD && !smtpPassChanged && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> App password is configured
                  </p>
                )}
              </div>
            </>
          ) : (
            /* ========== Resend Fields ========== */
            <>
              {/* Resend API Key */}
              <div className="space-y-1.5">
                <Label htmlFor="resend-key" className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" />
                  Resend API Key
                </Label>
                <Input
                  id="resend-key"
                  type="password"
                  placeholder="re_xxxxxxxxxxxx"
                  value={resendApiKey}
                  onChange={(e) => {
                    setResendApiKey(e.target.value);
                    setResendKeyChanged(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Your Resend API key. Encrypted in the database.
                  {settings.RESEND_API_KEY?.updatedAt && (
                    <span className="block mt-1">
                      Last updated:{" "}
                      {new Date(settings.RESEND_API_KEY.updatedAt).toLocaleString()}
                    </span>
                  )}
                </p>
                {settings.RESEND_API_KEY && !resendKeyChanged && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> API key is configured
                  </p>
                )}
              </div>

              {/* From Email (Resend-specific) */}
              <div className="space-y-1.5">
                <Label htmlFor="from-email">From Email</Label>
                <Input
                  id="from-email"
                  type="email"
                  placeholder="noreply@yourdomain.com"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must be a verified domain in your Resend dashboard.
                </p>
              </div>
            </>
          )}

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || !hasChanges()}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Settings"}
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
              Database settings above override these env vars. If no value is set in the
              database, the system falls back to env vars set in Vercel:
            </p>
            <div className="grid gap-2 sm:grid-cols-2 font-mono text-[11px]">
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">EMAIL_PROVIDER</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">SMTP_USER</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">SMTP_PASSWORD</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_API_KEY</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_FROM_EMAIL</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5">
                <span className="text-foreground/70">RESEND_FROM_NAME</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
