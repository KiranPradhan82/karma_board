import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { SUPERADMIN_FEATURES, invalidatePermissionCache } from "@/lib/feature-permissions";

/**
 * GET /api/admin/permissions
 * Returns all feature definitions + all ADMIN users with their permission states.
 * SUPERADMIN only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    const client = getTursoClient();

    // Fetch all ADMIN users (active, not deleted)
    const adminsResult = await client.execute({
      sql: `SELECT id, name, email, "jobTitle", "avatar", "createdAt" FROM "User"
            WHERE role = 'ADMIN' AND "isActive" = 1 AND "deletedAt" IS NULL
            ORDER BY name ASC`,
      args: [],
    });

    // Fetch all permission rows
    const permsResult = await client.execute({
      sql: `SELECT "userId", "featureKey", enabled FROM "AdminFeaturePermission"`,
      args: [],
    });

    // Build a lookup: userId → featureKey → enabled
    const permMap: Record<string, Record<string, boolean>> = {};
    for (const row of permsResult.rows) {
      const uid = row.userId as string;
      const fKey = row.featureKey as string;
      if (!permMap[uid]) permMap[uid] = {};
      permMap[uid][fKey] = Boolean(row.enabled);
    }

    // Build admin list with their permissions
    const admins = adminsResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      jobTitle: row.jobTitle as string | null,
      avatar: row.avatar as string | null,
      createdAt: row.createdAt as string,
      permissions: permMap[row.id as string] || {},
    }));

    return NextResponse.json({
      success: true,
      data: {
        features: SUPERADMIN_FEATURES,
        admins,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/permissions] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/permissions
 * Update permissions for a specific admin user.
 * Body: { userId: string, permissions: { featureKey: boolean, ... } }
 * SUPERADMIN only. Cannot modify own permissions.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    const body = await request.json();
    const { userId, permissions } = body;

    if (!userId || !permissions || typeof permissions !== "object") {
      return NextResponse.json(
        { success: false, error: "userId and permissions object are required" },
        { status: 400 },
      );
    }

    // Cannot modify own permissions
    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: "Cannot modify your own permissions" },
        { status: 400 },
      );
    }

    // Verify target user is an ADMIN
    const client = getTursoClient();
    const targetUser = await client.execute({
      sql: `SELECT id, role FROM "User" WHERE id = ? AND role = 'ADMIN' AND "isActive" = 1 AND "deletedAt" IS NULL`,
      args: [userId],
    });

    if (targetUser.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Active admin user not found" },
        { status: 404 },
      );
    }

    // Validate feature keys
    const validKeys = new Set(SUPERADMIN_FEATURES.map((f) => f.key));
    const ip = getClientIp(request);
    const now = new Date().toISOString();
    const updatedKeys: string[] = [];

    for (const [featureKey, enabled] of Object.entries(permissions)) {
      if (!validKeys.has(featureKey)) continue;
      const isEnabled = Boolean(enabled);

      await client.execute({
        sql: `INSERT INTO "AdminFeaturePermission" (id, "userId", "featureKey", enabled, "grantedBy", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
              ON CONFLICT("userId", "featureKey") DO UPDATE SET enabled = excluded.enabled, "grantedBy" = excluded."grantedBy", "updatedAt" = excluded."updatedAt"`,
        args: [crypto.randomUUID(), userId, featureKey, isEnabled ? 1 : 0, user.id],
      });

      updatedKeys.push(featureKey);
    }

    // Invalidate permission cache
    invalidatePermissionCache();

    // Audit log
    await logActivity({
      userId: user.id,
      action: "UPDATE_ADMIN_PERMISSIONS",
      details: `Updated permissions for admin ${userId}: ${updatedKeys.map((k) => `${k}=${permissions[k]}`).join(", ")}`,
      entity: "admin_permissions",
      entityId: userId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedKeys.length} permission(s) for admin`,
      data: { updatedKeys },
    });
  } catch (error) {
    console.error("[PUT /api/admin/permissions] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}