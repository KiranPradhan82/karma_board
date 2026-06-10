import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";
import { randomUUID } from "crypto";

/**
 * Check if a user has access to a project.
 */
async function hasProjectAccess(userId: string, userRole: string, projectId: string): Promise<boolean> {
  if (userRole === "SUPERADMIN") return true;
  const client = getTursoClient();
  const result = await client.execute({
    sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
    args: [projectId, userId],
  });
  return result.rows.length > 0;
}

// 90 seconds — single API call + retry
export const maxDuration = 90;

interface ZaiChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * GET /api/ai/zai-chat?projectId=xxx — Load saved z.ai chat history for a project.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const canAccess = await hasProjectAccess(user.id, user.role, projectId);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "You don't have access to this project" }, { status: 403 });
    }

    const client = getTursoClient();
    const result = await client.execute({
      sql: `SELECT id, role, content, createdAt FROM "ZaiChatMessage" WHERE "projectId" = ? ORDER BY "createdAt" ASC LIMIT 200`,
      args: [projectId],
    });

    const messages = result.rows.map((row) => ({
      role: row.role as string,
      content: row.content as string,
      createdAt: row.createdAt as string,
    }));

    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error("[GET /api/ai/zai-chat] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/ai/zai-chat — Proxy chat to z.ai API using stored API key.
 * Saves both the user message and AI response to ZaiChatMessage for persistence.
 *
 * Body: { projectId, messages: ZaiChatMessage[], contextSummary?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json() as {
      projectId: string;
      messages: ZaiChatMessage[];
      contextSummary?: string;
    };

    if (!body.projectId || !body.messages || body.messages.length === 0) {
      return NextResponse.json({ success: false, error: "projectId and messages are required" }, { status: 400 });
    }

    // Check project access
    const canAccess = await hasProjectAccess(user.id, user.role, body.projectId);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "You don't have access to this project" }, { status: 403 });
    }

    const client = getTursoClient();

    // Fetch z.ai bridge settings
    const apiKeyResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_API_KEY'`,
      args: [],
    });

    let bearerToken = "";
    if (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].value) {
      try { bearerToken = decrypt(apiKeyResult.rows[0].value as string); }
      catch { bearerToken = apiKeyResult.rows[0].value as string; }
    }

    if (!bearerToken) {
      return NextResponse.json({
        success: false,
        error: "z.ai API key not configured. Ask your Super Admin to set the API key in Settings → z.ai Bridge.",
      });
    }

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

    // Fetch project name for context
    const projectResult = await client.execute({
      sql: `SELECT name, description FROM "Project" WHERE id = ?`,
      args: [body.projectId],
    });
    const project = projectResult.rows[0];
    const projectName = project?.name as string || "Unknown Project";

    // Build system prompt
    const systemPrompt = `You are a senior full-stack developer AI assistant working on "${projectName}" via KarmaSpace Codex. You have access to the complete project brief including all generated documentation. Help the user build this project by providing implementation guidance, code examples, architecture decisions, and technical solutions. Be concise but thorough.` +
      (body.contextSummary ? `\n\nProject Context Summary:\n${body.contextSummary}` : "");

    // Build messages array for z.ai API
    const zaiMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of body.messages) {
      zaiMessages.push({ role: msg.role, content: msg.content });
    }

    // Get the last user message for persistence (only the new one, not history)
    const lastUserMessage = body.messages[body.messages.length - 1];

    // Save user message to database (fire-and-forget style, but await for consistency)
    if (lastUserMessage && lastUserMessage.role === "user") {
      try {
        await client.execute({
          sql: `INSERT INTO "ZaiChatMessage" (id, "projectId", role, content, "createdAt") VALUES (?, ?, ?, ?, datetime('now'))`,
          args: [randomUUID(), body.projectId, "user", lastUserMessage.content],
        });
      } catch (err) {
        console.error("[zai-chat] Failed to save user message:", err);
      }
    }

    // Call z.ai API with retry on 429
    const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const MAX_RETRIES = 2;
    const BASE_DELAY = 10_000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);

        const res = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            model,
            messages: zaiMessages,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.status === 429 && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`[zai-chat] 429 rate limit, attempt ${attempt + 1}, waiting ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          let detail = errText.slice(0, 200);
          try {
            const json = JSON.parse(errText);
            if (json.error?.message) detail = json.error.message;
          } catch { /* keep raw */ }

          if (res.status === 429) {
            return NextResponse.json({
              success: false,
              error: `z.ai rate limited (429): ${detail}. Wait 2-3 minutes and try again.`,
            });
          }
          if (res.status === 401) {
            return NextResponse.json({
              success: false,
              error: `z.ai auth failed (401): ${detail}. Your API key may be expired. Check Settings → z.ai Bridge.`,
            });
          }
          return NextResponse.json({
            success: false,
            error: `z.ai API error (${res.status}): ${detail}`,
          });
        }

        const data = await res.json();
        const aiContent = data.choices?.[0]?.message?.content || "";

        // Save AI response to database
        if (aiContent) {
          try {
            await client.execute({
              sql: `INSERT INTO "ZaiChatMessage" (id, "projectId", role, content, "createdAt") VALUES (?, ?, ?, ?, datetime('now'))`,
              args: [randomUUID(), body.projectId, "assistant", aiContent],
            });
          } catch (err) {
            console.error("[zai-chat] Failed to save AI response:", err);
          }
        }

        return NextResponse.json({
          success: true,
          content: aiContent,
          model,
        });

      } catch (err) {
        if (attempt === MAX_RETRIES) {
          const msg = err instanceof Error ? err.message : String(err);
          return NextResponse.json({
            success: false,
            error: `Network error contacting z.ai: ${msg}. Check your connection and try again.`,
          });
        }
        // Network error — retry once
        console.log(`[zai-chat] Network error, attempt ${attempt + 1}, retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    // Should not reach here
    return NextResponse.json({ success: false, error: "All retries exhausted." });
  } catch (error) {
    console.error("[POST /api/ai/zai-chat] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
