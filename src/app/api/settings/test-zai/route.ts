import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

// GET /api/settings/test-zai — Test z.ai API connection using stored credentials
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    const client = getTursoClient();

    // Fetch z.ai credentials from Settings table
    const usernameResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_USERNAME'`,
      args: [],
    });
    const passwordResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_PASSWORD'`,
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

    if (usernameResult.rows.length === 0 || !usernameResult.rows[0].value) {
      return NextResponse.json({ success: false, error: "z.ai username not configured" });
    }
    if (passwordResult.rows.length === 0 || !passwordResult.rows[0].value) {
      return NextResponse.json({ success: false, error: "z.ai password not configured" });
    }

    // Decrypt the password
    let password: string;
    try {
      password = decrypt(passwordResult.rows[0].value as string);
    } catch {
      password = passwordResult.rows[0].value as string;
    }
    const username = usernameResult.rows[0].value as string;

    const baseUrl = baseUrlResult.rows.length > 0 && baseUrlResult.rows[0].value
      ? (baseUrlResult.rows[0].value as string)
      : "https://api.z.ai/api/paas/v4";

    const model = modelResult.rows.length > 0 && modelResult.rows[0].value
      ? (modelResult.rows[0].value as string)
      : "glm-4.7-flash";

    // Test the connection with a simple chat completion request using password as bearer token
    const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const testResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${password}`,
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
