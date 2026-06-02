import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, logActivity, getClientIp } from "@/lib/api-auth";

/**
 * GET /api/ai/project-model?projectId=xxx
 * Returns the AI model setting for a specific project.
 * Any authenticated user can read (needed to show in UI).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = ?`,
      args: [`ai_model:${projectId}`],
    });

    const modelValue = result.rows.length > 0 ? (result.rows[0].value as string) : null;

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        model: modelValue,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/project-model] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/ai/project-model
 * Set the AI model for a specific project. SUPERADMIN only.
 *
 * Body: { projectId: string, model: string | null }
 * Pass model: null to reset to the global default.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { projectId, model } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);
    const key = `ai_model:${projectId}`;
    const now = new Date().toISOString();

    if (model === null || model === undefined || model === "") {
      // Reset to global default: delete the setting
      await client.execute({
        sql: `DELETE FROM "Settings" WHERE key = ?`,
        args: [key],
      });
    } else {
      // Upsert the model setting
      await client.execute({
        sql: `INSERT INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, "updatedAt" = excluded."updatedAt"`,
        args: [key, model, now],
      });
    }

    // Log activity
    await logActivity({
      userId: user.id,
      action: "SET_PROJECT_AI_MODEL",
      details: `Set AI model for project ${projectId} to: ${model || "global default"}`,
      entity: "ai_settings",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        model: model || null,
      },
    });
  } catch (error) {
    console.error("[PUT /api/ai/project-model] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
