import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api-auth";
import { getConfiguredModelsAsync, isAiConfiguredAsync } from "@/lib/ai-client";

interface RouteContext {
  params: Promise<{}>;
}

/**
 * GET /api/ai/configured-models
 * Returns the list of AI models that have API keys configured
 * (checks Settings DB first, then env vars).
 */
export async function GET(req: NextRequest, _ctx: RouteContext) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [configured, isConfigured] = await Promise.all([
      getConfiguredModelsAsync(),
      isAiConfiguredAsync(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        models: configured,
        isConfigured,
      },
    });
  } catch (error) {
    console.error("[configured-models] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check configured models" },
      { status: 500 },
    );
  }
}