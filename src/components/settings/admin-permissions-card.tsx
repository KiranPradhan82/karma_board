"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { errorToast } from "@/lib/error-toast";
import {
  Shield,
  ShieldCheck,
  Users,
  Loader2,
  Save,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Mail,
  Briefcase,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FeatureDef {
  key: string;
  label: string;
  description: string;
  category: string;
  icon: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatar: string | null;
  createdAt: string;
  permissions: Record<string, boolean>;
}

interface PermissionsData {
  features: FeatureDef[];
  admins: AdminUser[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AdminPermissionsCard() {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // userId being saved
  const [expandedAdmin, setExpandedAdmin] = useState<string | null>(null);
  const [localPerms, setLocalPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [changedAdmins, setChangedAdmins] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/permissions");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        // Initialize local perms
        const perms: Record<string, Record<string, boolean>> = {};
        for (const admin of json.data.admins) {
          perms[admin.id] = { ...admin.permissions };
        }
        setLocalPerms(perms);
      }
    } catch {
      // Silently fail — permissions card is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePermission = (adminId: string, featureKey: string) => {
    setLocalPerms((prev) => ({
      ...prev,
      [adminId]: {
        ...prev[adminId],
        [featureKey]: !prev[adminId][featureKey],
      },
    }));
    setChangedAdmins((prev) => new Set(prev).add(adminId));
  };

  const savePermissions = async (adminId: string) => {
    const admin = data?.admins.find((a) => a.id === adminId);
    if (!admin) return;

    setSaving(adminId);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adminId,
          permissions: localPerms[adminId],
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to save permissions");
        return;
      }
      toast.success(`Permissions updated for ${admin.name}`);
      setChangedAdmins((prev) => {
        const next = new Set(prev);
        next.delete(adminId);
        return next;
      });
      // Refresh data from server
      fetchData();
    } catch {
      errorToast();
    } finally {
      setSaving(null);
    }
  };

  const getEnabledCount = (adminId: string) => {
    const perms = localPerms[adminId] || {};
    return Object.values(perms).filter(Boolean).length;
  };

  const getCategoryFeatures = (category: string) => {
    return data?.features.filter((f) => f.category === category) || [];
  };

  const categories = [
    { key: "settings", label: "Settings & Config" },
    { key: "ai", label: "AI & Intelligence" },
    { key: "team", label: "Team & People" },
    { key: "projects", label: "Projects & Docs" },
    { key: "clients", label: "Client Portal" },
    { key: "analytics", label: "Analytics" },
  ];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 animate-pulse" />
            <div className="h-5 w-40 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-4 w-64 bg-muted animate-pulse rounded mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.admins.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Feature Permissions
          </CardTitle>
          <CardDescription>
            Control which SUPERADMIN features each admin can access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No admin users found. Promote members to admin to manage their permissions here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Feature Permissions
        </CardTitle>
        <CardDescription>
          Control which SUPERADMIN-level features each admin can access.
          Toggle features on/off per admin. Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.admins.map((admin) => {
          const isExpanded = expandedAdmin === admin.id;
          const isChanged = changedAdmins.has(admin.id);
          const isSaving = saving === admin.id;
          const enabledCount = getEnabledCount(admin.id);
          const totalFeatures = data.features.length;

          return (
            <div key={admin.id} className="border rounded-lg overflow-hidden">
              {/* Admin Header Row */}
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpandedAdmin(isExpanded ? null : admin.id)}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={admin.avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {admin.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{admin.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">ADMIN</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{admin.email}</span>
                    {admin.jobTitle && (
                      <>
                        <span className="mx-0.5">·</span>
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="truncate">{admin.jobTitle}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {enabledCount > 0 && (
                    <Badge
                      variant={enabledCount === totalFeatures ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {enabledCount}/{totalFeatures}
                    </Badge>
                  )}
                  {isChanged && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                      Unsaved
                    </Badge>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded Permission Grid */}
              {isExpanded && (
                <div className="border-t bg-muted/20">
                  <div className="p-3 space-y-4 max-h-[500px] overflow-y-auto">
                    {categories.map((cat, catIdx) => {
                      const catFeatures = getCategoryFeatures(cat.key);
                      if (catFeatures.length === 0) return null;

                      return (
                        <div key={cat.key}>
                          {catIdx > 0 && <Separator className="mb-4" />}
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                            {cat.label}
                          </h4>
                          <div className="space-y-2">
                            {catFeatures.map((feature) => {
                              const isEnabled = localPerms[admin.id]?.[feature.key] ?? false;
                              return (
                                <div
                                  key={feature.key}
                                  className="flex items-start gap-3 p-2 rounded-md hover:bg-background transition-colors"
                                >
                                  <div className="pt-0.5">
                                    <Switch
                                      checked={isEnabled}
                                      onCheckedChange={() => togglePermission(admin.id, feature.key)}
                                      disabled={isSaving}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{feature.label}</span>
                                      {isEnabled && (
                                        <ToggleRight className="h-3.5 w-3.5 text-emerald-500" />
                                      )}
                                      {!isEnabled && (
                                        <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground/40" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {feature.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Save Bar */}
                  <div className="border-t px-3 py-2.5 flex items-center justify-between bg-background">
                    <div className="text-xs text-muted-foreground">
                      {enabledCount} of {totalFeatures} features enabled
                    </div>
                    <div className="flex gap-2">
                      {isChanged && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLocalPerms((prev) => ({
                              ...prev,
                              [admin.id]: { ...admin.permissions },
                            }));
                            setChangedAdmins((prev) => {
                              const next = new Set(prev);
                              next.delete(admin.id);
                              return next;
                            });
                          }}
                        >
                          Discard
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={!isChanged || isSaving}
                        onClick={() => savePermissions(admin.id)}
                      >
                        {isSaving ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {isSaving ? "Saving..." : "Save Permissions"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}