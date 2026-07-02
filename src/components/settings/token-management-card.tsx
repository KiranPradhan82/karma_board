"use client";

import { useState } from "react";
import { toast } from "sonner";
import { errorToast } from "@/lib/error-toast";
import {
  Key,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Cpu,
  Github,
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
import { Separator } from "@/components/ui/separator";

/* ------------------------------------------------------------------ */
/*  Token Provider Definitions                                         */
/* ------------------------------------------------------------------ */

interface TokenField {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  icon: React.ReactNode;
  isKey: boolean;
}

const TOKEN_FIELDS: TokenField[] = [
  { key: "GROQ_API_KEY", label: "Groq API Key", placeholder: "gsk_...", description: "Fast inference for AI chat responses", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", placeholder: "sk-...", description: "GPT-4o, GPT-4, and other OpenAI models", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "GOOGLE_AI_API_KEY", label: "Google AI API Key", placeholder: "AIza...", description: "Gemini Pro, Gemini Flash models", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "TOGETHER_API_KEY", label: "Together AI API Key", placeholder: "Enter key...", description: "Open-source model hosting", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "SAMBANOVA_API_KEY", label: "SambaNova API Key", placeholder: "Enter key...", description: "Enterprise AI inference", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API Key", placeholder: "sk-or-...", description: "Universal AI model gateway", icon: <Globe className="h-4 w-4" />, isKey: true },
  { key: "ZAI_API_KEY", label: "z.ai API Key", placeholder: "Enter key...", description: "z.ai model access", icon: <Cpu className="h-4 w-4" />, isKey: true },
  { key: "AI_API_KEY", label: "Generic AI API Key", placeholder: "Fallback key...", description: "Generic fallback if provider-specific key is not set", icon: <Key className="h-4 w-4" />, isKey: true },
  { key: "GITHUB_PAT", label: "GitHub Personal Access Token", placeholder: "ghp_... or github_pat_...", description: "Used for AI-driven config and document push to GitHub repos", icon: <Github className="h-4 w-4" />, isKey: true },
];

const BASE_URL_FIELDS: TokenField[] = [
  { key: "GROQ_API_BASE_URL", label: "Groq Base URL", placeholder: "https://api.groq.com/openai/v1", description: "Override default Groq API endpoint", icon: <Globe className="h-4 w-4" />, isKey: false },
  { key: "OPENAI_API_BASE_URL", label: "OpenAI Base URL", placeholder: "https://api.openai.com/v1", description: "Override default OpenAI API endpoint", icon: <Globe className="h-4 w-4" />, isKey: false },
  { key: "GOOGLE_AI_API_BASE_URL", label: "Google AI Base URL", placeholder: "https://generativelanguage.googleapis.com/v1beta", description: "Override default Google AI endpoint", icon: <Globe className="h-4 w-4" />, isKey: false },
  { key: "OPENROUTER_API_BASE_URL", label: "OpenRouter Base URL", placeholder: "https://openrouter.ai/api/v1", description: "Override default OpenRouter endpoint", icon: <Globe className="h-4 w-4" />, isKey: false },
  { key: "AI_API_BASE_URL", label: "Generic AI Base URL", placeholder: "https://api.example.com/v1", description: "Override generic fallback API endpoint", icon: <Globe className="h-4 w-4" />, isKey: false },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SettingItem {
  value: string;
  masked: boolean;
  updatedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TokenManagementCard({
  settings,
  onSaved,
}: {
  settings: Record<string, SettingItem>;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of [...TOKEN_FIELDS, ...BASE_URL_FIELDS]) {
      const s = settings[field.key];
      initial[field.key] = s ? (s.masked ? "" : s.value) : "";
    }
    return initial;
  });

  const hasChanges = changedKeys.size > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const updatePayload: Record<string, string> = {};
      for (const key of changedKeys) {
        updatePayload[key] = values[key];
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: updatePayload }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Failed to save tokens");
        return;
      }
      toast.success(`${data.data.updatedKeys.length} token(s) saved successfully`);
      setChangedKeys(new Set());
      onSaved();
    } catch {
      errorToast();
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearKey = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: "" }));
    setChangedKeys((prev) => new Set(prev).add(key));
  };

  const hasAnyValue = (key: string) => {
    const s = settings[key];
    return s && !s.masked ? !!s.value : !!values[key];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="h-5 w-5" />
          Token &amp; API Key Management
        </CardTitle>
        <CardDescription>
          Configure AI provider API keys and service tokens. All keys are encrypted at rest.
          The AI chat reads keys from here — no environment variables needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Keys */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            AI Provider API Keys
          </h3>
          <div className="space-y-4">
            {TOKEN_FIELDS.map((field) => (
              <TokenInputRow
                key={field.key}
                field={field}
                value={values[field.key]}
                isSet={hasAnyValue(field.key)}
                isMasked={settings[field.key]?.masked}
                isVisible={visibleKeys.has(field.key)}
                changed={changedKeys.has(field.key)}
                disabled={saving}
                onChange={(v) => {
                  setValues((prev) => ({ ...prev, [field.key]: v }));
                  setChangedKeys((prev) => new Set(prev).add(field.key));
                }}
                onToggleVisibility={() => toggleVisibility(field.key)}
                onClear={() => clearKey(field.key)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Base URL Overrides */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Base URL Overrides
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </h3>
          <div className="space-y-4">
            {BASE_URL_FIELDS.map((field) => (
              <TokenInputRow
                key={field.key}
                field={field}
                value={values[field.key]}
                isSet={hasAnyValue(field.key)}
                isMasked={false}
                isVisible={true}
                changed={changedKeys.has(field.key)}
                disabled={saving}
                onChange={(v) => {
                  setValues((prev) => ({ ...prev, [field.key]: v }));
                  setChangedKeys((prev) => new Set(prev).add(field.key));
                }}
                onToggleVisibility={() => {}}
                onClear={() => clearKey(field.key)}
              />
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Saving..." : `Save ${changedKeys.size} Change(s)`}
          </Button>
          {hasChanges && (
            <span className="text-xs text-muted-foreground">
              {changedKeys.size} token(s) modified
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Token Input Row                                             */
/* ------------------------------------------------------------------ */

function TokenInputRow({
  field, value, isSet, isMasked, isVisible, changed, disabled,
  onChange, onToggleVisibility, onClear,
}: {
  field: TokenField;
  value: string;
  isSet: boolean;
  isMasked: boolean;
  isVisible: boolean;
  changed: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
  onToggleVisibility: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
        {isSet && !changed && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="h-2.5 w-2.5" /> Configured
          </span>
        )}
        {changed && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
            <AlertTriangle className="h-2.5 w-2.5" /> Modified
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {field.icon}
          </div>
          <Input
            id={field.key}
            type={field.isKey && !isVisible ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isMasked && !value ? "•••••••• (configured)" : field.placeholder}
            disabled={disabled}
            className="pl-9 pr-2 font-mono text-xs"
          />
        </div>
        {field.isKey && (
          <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={onToggleVisibility} tabIndex={-1}>
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
        {isSet && (
          <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-destructive hover:text-destructive" onClick={onClear} tabIndex={-1}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{field.description}</p>
    </div>
  );
}