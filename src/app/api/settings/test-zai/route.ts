import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

// GET /api/settings/test-zai — Test z.ai API connection using stored API key
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    const client = getTursoClient();

    // Fetch API key (primary method)
    const apiKeyResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_API_KEY'`,
      args: [],
    });

    let bearerToken = "";
    if (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].value) {
      try { bearerToken = decrypt(apiKeyResult.rows[0].value as string); }
      catch { bearerToken = apiKeyResult.rows[0].value as string; }
    } else {
      return NextResponse.json({ success: false, error: "z.ai API key not configured. Please set it in Settings → z.ai Bridge." });
    }

    // Fetch base URL and model
    const baseUrlResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_BASE_URL'`,
      args: [],
    });
    const modelResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_MODEL'`,
      args: [],
    });

    const baseUrl = baseUrlResult.rows.length > 0 && baseUrlResult.rows[0].value
      ? (baseUrlResult.rows[0].value as string)
      : "https://api.z.ai/api/paas/v4";

    const model = modelResult.rows.length > 0 && modelResult.rows[0].value
      ? (modelResult.rows[0].value as string)
      : "glm-4.7-flash";

    // Test the connection with a simple chat completion request
    const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const testResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: "Say 'Connection successful' in exactly 3 words." },
        ],
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!testResponse.ok) {
      const errorBody = await testResponse.text();
      console.error("[test-zai] API returned", testResponse.status, errorBody);
      return NextResponse.json({
        success: false,
        error: `z.ai API returned status ${testResponse.status}: ${errorBody.slice(0, 200)}`,
      });
    }

    return NextResponse.json({
      success: true,
      model,
    });
  } catch (error) {
    console.error("[GET /api/settings/test-zai] Error:", error);
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ success: false, error: message });
  }
}
