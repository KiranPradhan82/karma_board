/**
 * Feature permissions system for delegating SUPERADMIN features to ADMINs.
 *
 * SUPERADMIN always has all permissions. ADMINs have permissions only if
 * explicitly granted in the AdminFeaturePermission table. MEMBERs never
 * have these elevated permissions.
 */

import { getTursoClient } from "@/lib/api-auth";

// ===== Feature Definitions =====

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  category: "settings" | "ai" | "team" | "projects" | "clients" | "analytics";
  icon: string; // lucide icon name (for UI reference)
}

export const SUPERADMIN_FEATURES: FeatureDef[] = [
  {
    key: "settings_access",
    label: "Settings Access",
    description: "View and edit application settings (email, branding, PDF theme, etc.)",
    category: "settings",
    icon: "Settings",
  },
  {
    key: "token_management",
    label: "Token & API Key Management",
    description: "Manage AI provider API keys, GitHub PAT, and other service tokens",
    category: "settings",
    icon: "Key",
  },
  {
    key: "ai_routing_config",
    label: "AI Routing Config",
    description: "Manage AI model routing rules in the GitHub-driven config",
    category: "ai",
    icon: "GitBranch",
  },
  {
    key: "ai_analytics",
    label: "AI Usage Analytics",
    description: "View AI usage analytics, command statistics, and top users",
    category: "analytics",
    icon: "BarChart3",
  },
  {
    key: "team_manage",
    label: "Team Management",
    description: "Add, edit, remove, and manage team members",
    category: "team",
    icon: "Users",
  },
  {
    key: "project_create",
    label: "Create Projects",
    description: "Create new projects and manage project-level settings",
    category: "projects",
    icon: "FolderPlus",
  },
  {
    key: "client_manage",
    label: "Client Management",
    description: "Add, edit, and manage client accounts and portal access",
    category: "clients",
    icon: "Briefcase",
  },
  {
    key: "ai_chat_access",
    label: "AI Chat Access",
    description: "Access the AI assistant chat for document generation and queries",
    category: "ai",
    icon: "MessageSquare",
  },
  {
    key: "export_docs",
    label: "Export Documents",
    description: "Export project documents as PDF and push to GitHub",
    category: "projects",
    icon: "Download",
  },
  {
    key: "admin_permissions_manage",
    label: "Manage Admin Permissions",
    description: "Grant or revoke feature permissions for other admins",
    category: "settings",
    icon: "Shield",
  },
];

export const FEATURE_CATEGORIES = [
  { key: "settings", label: "Settings & Configuration" },
  { key: "ai", label: "AI & Intelligence" },
  { key: "team", label: "Team & People" },
  { key: "projects", label: "Projects & Documents" },
  { key: "clients", label: "Client Portal" },
  { key: "analytics", label: "Analytics & Reports" },
];

// Permission cache to avoid DB hit on every request
let _permCache: Record<string, Record<string, boolean>> | null = null;
let _permCacheTime = 0;
const PERM_CACHE_TTL = 30_000; // 30 seconds

/**
 * Check if a user has a specific feature permission.
 * SUPERADMIN always returns true.
 * ADMIN checks the AdminFeaturePermission table.
 * MEMBER always returns false (unless explicitly listed, which shouldn't happen).
 */
export async function hasFeaturePermission(
  userId: string,
  userRole: string,
  featureKey: string,
): Promise<boolean> {
  // SUPERADMIN has everything
  if (userRole === "SUPERADMIN") return true;

  // Only ADMIN can have delegated permissions
  if (userRole !== "ADMIN") return false;

  // Check cache
  const now = Date.now();
  if (_permCache && now - _permCacheTime < PERM_CACHE_TTL) {
    return _permCache[userId]?.[featureKey] ?? false;
  }

  try {
    const client = getTursoClient();
    const result = await client.execute({
      sql: `SELECT "featureKey", enabled FROM "AdminFeaturePermission" WHERE "userId" = ?`,
      args: [userId],
    });

    const userPerms: Record<string, boolean> = {};
    for (const row of result.rows) {
      userPerms[row.featureKey as string] = Boolean(row.enabled);
    }

    // Cache individual user
    if (!_permCache) _permCache = {};
    _permCache[userId] = userPerms;
    _permCacheTime = now;

    return userPerms[featureKey] ?? false;
  } catch (error) {
    console.error("[feature-permissions] Error checking permission:", error);
    return false;
  }
}

/**
 * Get all feature permissions for a specific admin user.
 * Returns a map: featureKey → boolean
 */
export async function getUserPermissions(
  userId: string,
): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (_permCache && now - _permCacheTime < PERM_CACHE_TTL && _permCache[userId]) {
    return _permCache[userId];
  }

  try {
    const client = getTursoClient();
    const result = await client.execute({
      sql: `SELECT "featureKey", enabled FROM "AdminFeaturePermission" WHERE "userId" = ?`,
      args: [userId],
    });

    const perms: Record<string, boolean> = {};
    for (const row of result.rows) {
      perms[row.featureKey as string] = Boolean(row.enabled);
    }

    if (!_permCache) _permCache = {};
    _permCache[userId] = perms;
    _permCacheTime = now;

    return perms;
  } catch (error) {
    console.error("[feature-permissions] Error getting user permissions:", error);
    return {};
  }
}

/**
 * Invalidate the permission cache (call after permissions are updated).
 */
export function invalidatePermissionCache(): void {
  _permCache = null;
  _permCacheTime = 0;
}