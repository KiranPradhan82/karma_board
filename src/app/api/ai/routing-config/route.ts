import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { loadRoutingConfigFromGithub, saveRoutingConfigToGithub, serializeRoutingConfig, type AiRoutingConfig } from "@/lib/github-config";
import { requireRole } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{}>;
}

/**
 * GET /api/ai/routing-config
 * Load AI routing config from GitHub repo (or return empty defaults).
 * SUPERADMIN only.
 */
export async function GET(req: NextRequest, _ctx: RouteContext) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const roleCheck = requireRole(["SUPERADMIN", "ADMIN"]);
  const denied = roleCheck(user);
  if (denied) return denied;

  try {
    const config = await loadRoutingConfigFromGithub();
    const tursoClient = getTursoClient();

    // Also check if GitHub is configured at all
    const repoResult = await tursoClient.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
      args: [],
    });

    return NextResponse.json({
      success: true,
      data: {
        config: config || {
          version: "1.0",
          defaultModel: "",
          modelRules: [],
        },
        githubConfigured: repoResult.rows.length > 0,
      },
    });
  } catch (error) {
    console.error("[routing-config] GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to load routing config" }, { status: 500 });
  }
}

/**
 * POST /api/ai/routing-config
 * Save AI routing config to GitHub repo.
 * SUPERADMIN only.
 * Body: AiRoutingConfig
 */
export async function POST(req: NextRequest, _ctx: RouteContext) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const roleCheck = requireRole(["SUPERADMIN"]);
  const denied = roleCheck(user);
  if (denied) return denied;

  const tursoClient = getTursoClient();
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const config = body as AiRoutingConfig;

    // Basic validation
    if (!config.version) config.version = "1.0";
    if (!config.defaultModel) {
      return NextResponse.json(
        { success: false, error: "defaultModel is required" },
        { status: 400 },
      );
    }

    const result = await saveRoutingConfigToGithub(config, tursoClient);

    if (result.success) {
      await logActivity({
        userId: user.id,
        action: "AI_ROUTING_CONFIG_SAVED",
        details: `Default model: ${config.defaultModel}, ${config.modelRules?.length || 0} routing rules`,
        entity: "AiRoutingConfig",
        ipAddress: ip,
        tursoClient,
      });

      return NextResponse.json({
        success: true,
        data: { commitSha: result.commitSha },
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to save config to GitHub" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[routing-config] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to save routing config" }, { status: 500 });
  }
}