import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

// POST /api/settings/test-zai — Test z.ai API connection
// If body contains apiKey, test that directly (form just typed it).
// Otherwise fall back to the key stored in the database.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole("SUPERADMIN")(user);
    if (roleCheck) return roleCheck;

    // Check if a key was sent in the body (user is testing a newly-entered key before saving)
    let bearerToken = "";
    let source = "database";

    try {
      const body = await request.json();
      if (body.apiKey && typeof body.apiKey === "string" && body.apiKey.trim()) {
        bearerToken = body.apiKey.trim();
        source = "form";
      }
    } catch {
      // No body or invalid JSON — fall back to database
    }

    // Fallback: read from database
    if (!bearerToken) {
      const client = getTursoClient();
      const apiKeyResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_API_KEY'`,
        args: [],
      });

      if (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].value) {
        try { bearerToken = decrypt(apiKeyResult.rows[0].value as string); }
        catch { bearerToken = apiKeyResult.rows[0].value as string; }
      } else {
        return NextResponse.json({ success: false, error: "z.ai API key not configured. Please set it in Settings → z.ai Bridge." });
      }
    }

    // Fetch base URL and model from database (these aren't in the form POST)
    const client = getTursoClient();
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

    console.log(`[test-zai] Testing with key from ${source}, model=${model}, url=${chatUrl}`);

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

      // Try to extract a nicer message from the error body
      let detailMsg = errorBody.slice(0, 500);
      try {
        const errJson = JSON.parse(errorBody);
        if (errJson.error?.message) {
          detailMsg = errJson.error.message;
        } else if (errJson.error) {
          detailMsg = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
        }
      } catch { /* keep raw body */ }

      const guidance = testResponse.status === 401
        ? "\n\nTip: Your API key may be expired or incorrect. Go to z.ai to generate a fresh key."
        : "";

      return NextResponse.json({
        success: false,
        error: `z.ai API returned status ${testResponse.status}: ${detailMsg}${guidance}`,
      });
    }

    const responseData = await testResponse.json();
    const replyText = responseData.choices?.[0]?.message?.content || "(empty response)";

    return NextResponse.json({
      success: true,
      model,
      reply: replyText,
      keySource: source,
    });
  } catch (error) {
    console.error("[POST /api/settings/test-zai] Error:", error);
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ success: false, error: message });
  }
}
