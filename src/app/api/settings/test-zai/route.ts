import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

// GET /api/settings/test-zai — Test z.ai API connection
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    const client = getTursoClient();

    // Fetch z.ai settings from Settings table
    const apiKeyResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_API_KEY'`,
      args: [],
    });
    const baseUrlResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_BASE_URL'`,
      args: [],
    });
    const modelResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_MODEL'`,
      args: [],
    });

    if (apiKeyResult.rows.length === 0 || !apiKeyResult.rows[0].value) {
      return NextResponse.json({ success: false, error: "z.ai API key not configured" });
    }

    // Decrypt the API key
    let apiKey: string;
    try {
      apiKey = decrypt(apiKeyResult.rows[0].value as string);
    } catch {
      apiKey = apiKeyResult.rows[0].value as string;
    }

    const baseUrl = baseUrlResult.rows.length > 0 && baseUrlResult.rows[0].value
      ? (baseUrlResult.rows[0].value as string)
      : "https://api.z.ai/api/paas/v4";

    const model = modelResult.rows.length > 0 && modelResult.rows[0].value
      ? (modelResult.rows[0].value as string)
      : "glm-5-turbo";

    // Test the connection with a simple chat completion request
    const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const testResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: "Say 'Connection successful' in exactly 3 words." },
        ],
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!testResponse.ok) {
      const errorBody = await testResponse.text();
      console.error("[test-zai] API returned", testResponse.status, errorBody);
      return NextResponse.json({
        success: false,
        error: `z.ai API returned status ${testResponse.status}: ${errorBody.slice(0, 200)}`,
      });
    }

    const responseData = await testResponse.json();

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
