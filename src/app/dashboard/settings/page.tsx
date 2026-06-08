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
  Palette,
  Globe,
  Zap,
  XCircle,
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

  // PDF Theme state
  const [pdfThemePrimary, setPdfThemePrimary] = useState("#1E40AF");
  const [pdfThemePrimaryLight, setPdfThemePrimaryLight] = useState("#3B82F6");
  const [pdfThemePrimaryBg, setPdfThemePrimaryBg] = useState("#EFF6FF");
  const [pdfThemeAltRowBg, setPdfThemeAltRowBg] = useState("#F9FAFB");
  const [pdfThemeCoverTop, setPdfThemeCoverTop] = useState("#1E3A8A");
  const [pdfThemeAccent, setPdfThemeAccent] = useState("#059669");
  const [pdfThemeWarning, setPdfThemeWarning] = useState("#D97706");
  const [pdfThemeDanger, setPdfThemeDanger] = useState("#DC2626");
  const [pdfThemeHasChanges, setPdfThemeHasChanges] = useState(false);
  const [pdfThemeSaving, setPdfThemeSaving] = useState(false);

  // z.ai Bridge state
  const [zaiLoginMethod, setZaiLoginMethod] = useState<"email" | "google">("email");
  const [zaiEmail, setZaiEmail] = useState("");
  const [zaiEmailChanged, setZaiEmailChanged] = useState(false);
  const [zaiPassword, setZaiPassword] = useState("");
  const [zaiPasswordChanged, setZaiPasswordChanged] = useState(false);
  const [zaiGoogleToken, setZaiGoogleToken] = useState("");
  const [zaiGoogleTokenChanged, setZaiGoogleTokenChanged] = useState(false);
  const [zaiBaseUrl, setZaiBaseUrl] = useState("https://api.z.ai/api/paas/v4");
  const [zaiModel, setZaiModel] = useState("glm-4.7-flash");
  const [zaiTestStatus, setZaiTestStatus] = useState<null | 'success' | 'error'>(null);
  const [zaiTesting, setZaiTesting] = useState(false);
  const [zaiSaving, setZaiSaving] = useState(false);

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

          // Load z.ai Bridge settings
          if (data.ZAI_BRIDGE_LOGIN_METHOD) setZaiLoginMethod(data.ZAI_BRIDGE_LOGIN_METHOD.value as "email" | "google");
          if (data.ZAI_BRIDGE_EMAIL) setZaiEmail(data.ZAI_BRIDGE_EMAIL.value);
          if (data.ZAI_BRIDGE_PASSWORD) setZaiPassword(data.ZAI_BRIDGE_PASSWORD.value);
          if (data.ZAI_BRIDGE_GOOGLE_TOKEN) setZaiGoogleToken(data.ZAI_BRIDGE_GOOGLE_TOKEN.value);
          if (data.ZAI_BRIDGE_BASE_URL) setZaiBaseUrl(data.ZAI_BRIDGE_BASE_URL.value);
          if (data.ZAI_BRIDGE_MODEL) setZaiModel(data.ZAI_BRIDGE_MODEL.value);

          // Load PDF theme
          if (data.PDF_THEME) {
            try {
              const theme = JSON.parse(data.PDF_THEME.value);
              if (theme.primary) setPdfThemePrimary(theme.primary);
              if (theme.primaryLight) setPdfThemePrimaryLight(theme.primaryLight);
              if (theme.primaryBg) setPdfThemePrimaryBg(theme.primaryBg);
              if (theme.altRowBg) setPdfThemeAltRowBg(theme.altRowBg);
              if (theme.coverGradientTop) setPdfThemeCoverTop(theme.coverGradientTop);
              if (theme.accent) setPdfThemeAccent(theme.accent);
              if (theme.warning) setPdfThemeWarning(theme.warning);
              if (theme.danger) setPdfThemeDanger(theme.danger);
            } catch { /* ignore invalid JSON */ }
          }
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

  // Test z.ai connection
  async function handleTestZai() {
    setZaiTesting(true);
    setZaiTestStatus(null);
    try {
      const res = await fetch("/api/settings/test-zai");
      const json = await res.json();
      setZaiTestStatus(json.success ? "success" : "error");
      if (json.success) {
        toast.success("z.ai connection successful! Model: " + (json.model || "OK"));
      } else {
        toast.error(json.error || "Connection failed");
      }
    } catch {
      setZaiTestStatus("error");
      toast.error("Failed to test z.ai connection");
    } finally {
      setZaiTesting(false);
    }
  }

  // Save z.ai bridge settings
  async function handleSaveZai() {
    setZaiSaving(true);
    try {
      const updateSettings: Record<string, string> = {};
      // Always save the login method
      updateSettings.ZAI_BRIDGE_LOGIN_METHOD = zaiLoginMethod;
      // Save method-specific credentials
      if (zaiLoginMethod === "email") {
        if (zaiEmailChanged && zaiEmail) updateSettings.ZAI_BRIDGE_EMAIL = zaiEmail;
        if (zaiPasswordChanged && zaiPassword) updateSettings.ZAI_BRIDGE_PASSWORD = zaiPassword;
        // Clear google token if switching away
        updateSettings.ZAI_BRIDGE_GOOGLE_TOKEN = "";
      } else {
        if (zaiGoogleTokenChanged) updateSettings.ZAI_BRIDGE_GOOGLE_TOKEN = zaiGoogleToken || "";
        // Clear email/password if switching away
        updateSettings.ZAI_BRIDGE_EMAIL = "";
        updateSettings.ZAI_BRIDGE_PASSWORD = "";
      }
      if (zaiBaseUrl !== (settings.ZAI_BRIDGE_BASE_URL?.value || "https://api.z.ai/api/paas/v4")) updateSettings.ZAI_BRIDGE_BASE_URL = zaiBaseUrl;
      if (zaiModel !== (settings.ZAI_BRIDGE_MODEL?.value || "glm-4.7-flash")) updateSettings.ZAI_BRIDGE_MODEL = zaiModel;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: updateSettings }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("z.ai Bridge settings saved successfully");
        setZaiEmailChanged(false);
        setZaiPasswordChanged(false);
        setZaiGoogleTokenChanged(false);
        // Refresh settings
        const refreshRes = await fetch("/api/settings");
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) {
          setSettings(refreshJson.data);
          const data = refreshJson.data as Record<string, SettingItem>;
          if (data.ZAI_BRIDGE_LOGIN_METHOD) setZaiLoginMethod(data.ZAI_BRIDGE_LOGIN_METHOD.value as "email" | "google");
          if (data.ZAI_BRIDGE_EMAIL) setZaiEmail(data.ZAI_BRIDGE_EMAIL.value);
          if (data.ZAI_BRIDGE_PASSWORD) setZaiPassword(data.ZAI_BRIDGE_PASSWORD.value);
          if (data.ZAI_BRIDGE_GOOGLE_TOKEN) setZaiGoogleToken(data.ZAI_BRIDGE_GOOGLE_TOKEN.value);
          if (data.ZAI_BRIDGE_BASE_URL) setZaiBaseUrl(data.ZAI_BRIDGE_BASE_URL.value);
          if (data.ZAI_BRIDGE_MODEL) setZaiModel(data.ZAI_BRIDGE_MODEL.value);
        }
      } else {
        toast.error(json.error || "Failed to save settings");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setZaiSaving(false);
    }
  }

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
          if (data.ZAI_BRIDGE_API_KEY && !zaiApiKeyChanged) setZaiApiKey(data.ZAI_BRIDGE_API_KEY.value);
          if (data.ZAI_BRIDGE_BASE_URL) setZaiBaseUrl(data.ZAI_BRIDGE_BASE_URL.value);
          if (data.ZAI_BRIDGE_MODEL) setZaiModel(data.ZAI_BRIDGE_MODEL.value);
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

  // Save PDF theme separately
  async function handleSavePdfTheme() {
    setPdfThemeSaving(true);
    try {
      const themeObj = {
        primary: pdfThemePrimary,
        primaryLight: pdfThemePrimaryLight,
        primaryBg: pdfThemePrimaryBg,
        altRowBg: pdfThemeAltRowBg,
        coverGradientTop: pdfThemeCoverTop,
        coverGradientBottom: pdfThemePrimary,
        accent: pdfThemeAccent,
        warning: pdfThemeWarning,
        danger: pdfThemeDanger,
      };

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { PDF_THEME: JSON.stringify(themeObj) } }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success("PDF theme saved successfully");
        setPdfThemeHasChanges(false);
        // Refresh settings
        const refreshRes = await fetch("/api/settings");
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) {
          setSettings(refreshJson.data);
          const data = refreshJson.data as Record<string, SettingItem>;
          if (data.PDF_THEME) {
            const theme = JSON.parse(data.PDF_THEME.value);
            if (theme.primary) setPdfThemePrimary(theme.primary);
            if (theme.primaryLight) setPdfThemePrimaryLight(theme.primaryLight);
            if (theme.primaryBg) setPdfThemePrimaryBg(theme.primaryBg);
            if (theme.altRowBg) setPdfThemeAltRowBg(theme.altRowBg);
            if (theme.coverGradientTop) setPdfThemeCoverTop(theme.coverGradientTop);
            if (theme.accent) setPdfThemeAccent(theme.accent);
            if (theme.warning) setPdfThemeWarning(theme.warning);
            if (theme.danger) setPdfThemeDanger(theme.danger);
          }
        }
      } else {
        toast.error(json.error || "Failed to save PDF theme");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPdfThemeSaving(false);
    }
  }

  // Track PDF theme changes
  useEffect(() => {
    const saved = settings.PDF_THEME?.value;
    if (!saved) return;
    try {
      const theme = JSON.parse(saved);
      const changed = (
        pdfThemePrimary !== (theme.primary || "#1E40AF") ||
        pdfThemePrimaryLight !== (theme.primaryLight || "#3B82F6") ||
        pdfThemePrimaryBg !== (theme.primaryBg || "#EFF6FF") ||
        pdfThemeAltRowBg !== (theme.altRowBg || "#F9FAFB") ||
        pdfThemeCoverTop !== (theme.coverGradientTop || "#1E3A8A") ||
        pdfThemeAccent !== (theme.accent || "#059669") ||
        pdfThemeWarning !== (theme.warning || "#D97706") ||
        pdfThemeDanger !== (theme.danger || "#DC2626")
      );
      setPdfThemeHasChanges(changed);
    } catch { setPdfThemeHasChanges(true); }
  }, [pdfThemePrimary, pdfThemePrimaryLight, pdfThemePrimaryBg, pdfThemeAltRowBg, pdfThemeCoverTop, pdfThemeAccent, pdfThemeWarning, pdfThemeDanger, settings.PDF_THEME]);

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

      {/* z.ai Bridge Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            z.ai Bridge
          </CardTitle>
          <CardDescription>
            Connect KarmaBoard to z.ai so users can launch project context into z.ai agentic chat sessions.
            When a user types <code className="text-xs bg-muted px-1 py-0.5 rounded">/init</code> in Karma Space, all 6 project documents are sent to z.ai and the browser auto-redirects to the z.ai chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <Zap className="h-4 w-4" />
            <AlertDescription>
              When configured, typing <strong>/init</strong> in Karma Space will automatically send all 6 project documents to z.ai, create a chat session named after the user (e.g. "Kiran's Workspace"), and redirect the browser to z.ai. Default model <strong>glm-4.7-flash</strong> is completely free.
            </AlertDescription>
          </Alert>

          <Separator />

          {/* Login Method Selector */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Login Method
            </Label>
            <Select value={zaiLoginMethod} onValueChange={(v) => setZaiLoginMethod(v as "email" | "google")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email + Password</span>
                  </div>
                </SelectItem>
                <SelectItem value="google">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Google Login</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose how KarmaBoard authenticates with z.ai on your behalf.
            </p>
          </div>

          <Separator />

          {/* Conditional fields based on login method */}
          {zaiLoginMethod === "email" ? (
            <>
              {/* Email + Password fields */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="zai-email" className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    z.ai Email
                  </Label>
                  <Input
                    id="zai-email"
                    type="email"
                    placeholder="you@example.com"
                    value={zaiEmail}
                    onChange={(e) => {
                      setZaiEmail(e.target.value);
                      setZaiEmailChanged(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    The email address you use to log into z.ai.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zai-password" className="flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" />
                    z.ai Password
                  </Label>
                  <Input
                    id="zai-password"
                    type="password"
                    placeholder="Enter z.ai password"
                    value={zaiPassword}
                    onChange={(e) => {
                      setZaiPassword(e.target.value);
                      setZaiPasswordChanged(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your z.ai password. Stored encrypted in the database.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Google Login fields */}
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Globe className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium">How to connect via Google</p>
                      <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                        <li>Click <strong>Sign in with Google</strong> below to open z.ai</li>
                        <li>Log into z.ai using your Google account</li>
                        <li>Go to z.ai Settings and copy your <strong>API Token</strong></li>
                        <li>Paste the token in the field below</li>
                      </ol>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => window.open("https://z.ai/login", "_blank", "noopener,noreferrer")}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Sign in with Google on z.ai
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zai-google-token" className="flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" />
                    z.ai API Token
                  </Label>
                  <Input
                    id="zai-google-token"
                    type="password"
                    placeholder="Paste your z.ai API token here"
                    value={zaiGoogleToken}
                    onChange={(e) => {
                      setZaiGoogleToken(e.target.value);
                      setZaiGoogleTokenChanged(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your z.ai API token (found in z.ai Settings after Google login). Stored encrypted.
                  </p>
                  {settings.ZAI_BRIDGE_GOOGLE_TOKEN && !zaiGoogleTokenChanged && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Google token is configured
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* z.ai Base URL */}
          <div className="space-y-1.5">
            <Label htmlFor="zai-base-url" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              z.ai Base URL
            </Label>
            <Input
              id="zai-base-url"
              type="text"
              placeholder="https://api.z.ai/api/paas/v4"
              value={zaiBaseUrl}
              onChange={(e) => setZaiBaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The z.ai API endpoint. Default: <code className="text-[11px]">https://api.z.ai/api/paas/v4</code>
            </p>
          </div>

          <Separator />

          {/* z.ai Model */}
          <div className="space-y-1.5">
            <Label htmlFor="zai-model" className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              z.ai Model
            </Label>
            <Input
              id="zai-model"
              type="text"
              placeholder="glm-4.7-flash"
              value={zaiModel}
              onChange={(e) => setZaiModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The model to use for z.ai chat sessions. Default: <code className="text-[11px]">glm-4.7-flash</code> (FREE)
            </p>
          </div>

          {/* Test Connection + Save */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestZai}
              disabled={
                zaiTesting ||
                (zaiLoginMethod === "email" && (!settings.ZAI_BRIDGE_EMAIL || !settings.ZAI_BRIDGE_PASSWORD)) ||
                (zaiLoginMethod === "google" && !settings.ZAI_BRIDGE_GOOGLE_TOKEN)
              }
            >
              {zaiTesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : zaiTestStatus === "success" ? (
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
              ) : zaiTestStatus === "error" ? (
                <XCircle className="mr-2 h-4 w-4 text-red-500" />
              ) : null}
              {zaiTesting ? "Testing..." : "Test Connection"}
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleSaveZai}
              disabled={
                zaiSaving ||
                (!zaiEmailChanged && !zaiPasswordChanged && !zaiGoogleTokenChanged &&
                  zaiLoginMethod === (settings.ZAI_BRIDGE_LOGIN_METHOD?.value || "email") &&
                  zaiBaseUrl === (settings.ZAI_BRIDGE_BASE_URL?.value || "https://api.z.ai/api/paas/v4") &&
                  zaiModel === (settings.ZAI_BRIDGE_MODEL?.value || "glm-4.7-flash"))
              }
            >
              {zaiSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {zaiSaving ? "Saving..." : "Save"}
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

      {/* PDF Theme Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5" />
            PDF Theme
          </CardTitle>
          <CardDescription>
            Customize the colors and styling of generated PDF documents. Changes apply
            immediately to all future PDF exports. Only you (Super Admin) can modify these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              All PDFs generated by Karma Space AI will use these theme colors. This includes
              individual message PDFs, project reports, and the combined documents download.
            </AlertDescription>
          </Alert>

          <Separator />

          {/* Live preview strip */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Live Preview</Label>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemePrimary }} />
                <span className="text-xs text-muted-foreground">Primary</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemePrimaryLight }} />
                <span className="text-xs text-muted-foreground">Light</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemePrimaryBg }} />
                <span className="text-xs text-muted-foreground">Table BG</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemeAltRowBg }} />
                <span className="text-xs text-muted-foreground">Alt Row</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemeCoverTop }} />
                <span className="text-xs text-muted-foreground">Cover</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemeAccent }} />
                <span className="text-xs text-muted-foreground">Accent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemeWarning }} />
                <span className="text-xs text-muted-foreground">Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded border" style={{ backgroundColor: pdfThemeDanger }} />
                <span className="text-xs text-muted-foreground">Danger</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Color inputs */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pdf-primary" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemePrimary }} />
                Primary Color
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-primary"
                  type="color"
                  value={pdfThemePrimary}
                  onChange={(e) => setPdfThemePrimary(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemePrimary}
                  onChange={(e) => setPdfThemePrimary(e.target.value)}
                  placeholder="#1E40AF"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Main brand color for headings, accents, and cover</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-primary-light" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemePrimaryLight }} />
                Light Accent
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-primary-light"
                  type="color"
                  value={pdfThemePrimaryLight}
                  onChange={(e) => setPdfThemePrimaryLight(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemePrimaryLight}
                  onChange={(e) => setPdfThemePrimaryLight(e.target.value)}
                  placeholder="#3B82F6"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Table headers, bullet dots, H2 accents</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-primary-bg" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0 border" style={{ backgroundColor: pdfThemePrimaryBg }} />
                Table Header BG
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-primary-bg"
                  type="color"
                  value={pdfThemePrimaryBg}
                  onChange={(e) => setPdfThemePrimaryBg(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemePrimaryBg}
                  onChange={(e) => setPdfThemePrimaryBg(e.target.value)}
                  placeholder="#EFF6FF"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Background color for table headers</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-alt-row" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0 border" style={{ backgroundColor: pdfThemeAltRowBg }} />
                Alternating Row BG
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-alt-row"
                  type="color"
                  value={pdfThemeAltRowBg}
                  onChange={(e) => setPdfThemeAltRowBg(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemeAltRowBg}
                  onChange={(e) => setPdfThemeAltRowBg(e.target.value)}
                  placeholder="#F9FAFB"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Shading for odd-numbered table rows</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-cover-top" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemeCoverTop }} />
                Cover Header
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-cover-top"
                  type="color"
                  value={pdfThemeCoverTop}
                  onChange={(e) => setPdfThemeCoverTop(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemeCoverTop}
                  onChange={(e) => setPdfThemeCoverTop(e.target.value)}
                  placeholder="#1E3A8A"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Gradient color for PDF cover page header</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-accent" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemeAccent }} />
                Accent (Success)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-accent"
                  type="color"
                  value={pdfThemeAccent}
                  onChange={(e) => setPdfThemeAccent(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemeAccent}
                  onChange={(e) => setPdfThemeAccent(e.target.value)}
                  placeholder="#059669"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Green accent for success/priority indicators</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-warning" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemeWarning }} />
                Warning Color
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-warning"
                  type="color"
                  value={pdfThemeWarning}
                  onChange={(e) => setPdfThemeWarning(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemeWarning}
                  onChange={(e) => setPdfThemeWarning(e.target.value)}
                  placeholder="#D97706"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Amber for warnings and medium priority</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pdf-danger" className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: pdfThemeDanger }} />
                Danger Color
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pdf-danger"
                  type="color"
                  value={pdfThemeDanger}
                  onChange={(e) => setPdfThemeDanger(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={pdfThemeDanger}
                  onChange={(e) => setPdfThemeDanger(e.target.value)}
                  placeholder="#DC2626"
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">Red for critical/high priority and errors</p>
            </div>
          </div>

          {/* Reset to default */}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => {
              setPdfThemePrimary("#1E40AF");
              setPdfThemePrimaryLight("#3B82F6");
              setPdfThemePrimaryBg("#EFF6FF");
              setPdfThemeAltRowBg("#F9FAFB");
              setPdfThemeCoverTop("#1E3A8A");
              setPdfThemeAccent("#059669");
              setPdfThemeWarning("#D97706");
              setPdfThemeDanger("#DC2626");
            }}>
              Reset to Default
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSavePdfTheme} disabled={pdfThemeSaving || !pdfThemeHasChanges}>
              {pdfThemeSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {pdfThemeSaving ? "Saving..." : "Save Theme"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
