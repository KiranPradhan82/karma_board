import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";

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

const DOC_TYPES = ["prd", "trd", "flow", "ux", "schema", "plan"];

const DOC_LABELS: Record<string, string> = {
  prd: "Product Requirements Document",
  trd: "Technical Requirements Document",
  flow: "Application Flow Document",
  ux: "UI/UX Design Brief",
  schema: "Backend Schema Document",
  plan: "Implementation Plan",
};

export const maxDuration = 60;

/**
 * Retry a fetch with exponential backoff for 429 errors.
 * Retries up to 3 times with delays of 2s, 4s, 8s.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
    console.log(`[zai-bridge] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  // Should not reach here, but TypeScript needs it
  return fetch(url, options);
}

// POST /api/ai/zai-bridge — Build project context and launch z.ai chat
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { projectId } = await request.json() as { projectId: string };
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    // Check project access
    const canAccess = await hasProjectAccess(user.id, user.role, projectId);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "You don't have access to this project" }, { status: 403 });
    }

    const client = getTursoClient();

    // 1. Fetch project info
    const projectResult = await client.execute({
      sql: `SELECT name, description, "clientName", status, priority, deadline FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    const project = projectResult.rows[0];
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // 2. Fetch ALL ProjectDocument rows for this project
    const docsResult = await client.execute({
      sql: `SELECT "docType", title, content, version FROM "ProjectDocument" WHERE "projectId" = ? ORDER BY "docType"`,
      args: [projectId],
    });

    if (docsResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No project documents found. Please generate all 6 documents first using /docs command.",
      });
    }

    const documents: { docType: string; title: string; content: string; version: number }[] =
      docsResult.rows.map((row) => ({
        docType: row.docType as string,
        title: row.title as string,
        content: row.content as string,
        version: Number(row.version),
      }));

    // 3. Fetch project settings for context
    let githubRepoUrl = "";
    try {
      const repoResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
        args: [],
      });
      if (repoResult.rows.length > 0) githubRepoUrl = repoResult.rows[0].value as string;
    } catch { /* non-critical */ }

    // 4. Fetch z.ai bridge API key (primary auth method)
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
        error: "z.ai API key not configured. Please ask your Super Admin to set the API key in Settings → z.ai Bridge.",
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

    const zaiModel = modelResult.rows.length > 0 && modelResult.rows[0].value
      ? (modelResult.rows[0].value as string)
      : "glm-4.7-flash";

    // 5. Check for existing chat mapping
    const chatKey = `ZAI_CHAT:${projectId}`;
    const existingChatResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = ?`,
      args: [chatKey],
    });

    let chatId: string;
    let isNewChat = false;

    if (existingChatResult.rows.length > 0 && existingChatResult.rows[0].value) {
      chatId = existingChatResult.rows[0].value as string;
    } else {
      chatId = crypto.randomUUID();
      isNewChat = true;
      // Save the mapping
      await client.execute({
        sql: `INSERT OR REPLACE INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
        args: [chatKey, chatId],
      });
    }

    // 6. Build comprehensive project context
    const projectName = project.name as string;
    const projectDescription = project.description as string;
    const projectPriority = project.priority as string;
    const projectDeadline = project.deadline as string;
    const projectClient = project.clientName as string;
    const projectStatus = project.status as string;

    // Load user name
    let userName = user.name || "User";
    try {
      const userResult = await client.execute({
        sql: `SELECT name FROM "User" WHERE id = ?`,
        args: [user.id],
      });
      if (userResult.rows.length > 0) userName = userResult.rows[0].name as string;
    } catch { /* fallback */ }

    let context = `# ${projectName} — Complete Project Brief\n\n`;
    context += `**Project:** ${projectName}\n`;
    if (projectDescription) context += `**Description:** ${projectDescription}\n`;
    if (projectClient) context += `**Client:** ${projectClient}\n`;
    if (projectStatus) context += `**Status:** ${projectStatus}\n`;
    if (projectPriority) context += `**Priority:** ${projectPriority}\n`;
    if (projectDeadline) context += `**Deadline:** ${projectDeadline}\n`;
    if (githubRepoUrl) context += `**GitHub Repo:** ${githubRepoUrl}\n`;
    context += `**Prepared by:** ${userName}\n`;
    context += `\n---\n\n`;

    // Add all documents
    for (const doc of documents) {
      const label = DOC_LABELS[doc.docType] || doc.docType.toUpperCase();
      const docContent = doc.content || "(empty)";
      // Truncate very long documents for the context (keep first 8000 chars of each doc)
      const truncatedContent = docContent.length > 8000
        ? docContent.slice(0, 8000) + "\n\n... (truncated)"
        : docContent;

      context += `## ${label} (v${doc.version})\n\n${truncatedContent}\n\n---\n\n`;
    }

    // 7. Send context to z.ai via API (with retry for 429 rate limits)
    let aiResponse = "";
    let apiError = "";
    try {
      const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

      const response = await fetchWithRetry(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          model: zaiModel,
          messages: [
            {
              role: "system",
              content: `You are a senior full-stack developer AI assistant. You will receive a complete project brief below with all generated documentation (PRD, TRD, Flow, UX, Schema, Plan). Help the user build this project by understanding all the requirements and providing implementation guidance. The chat name is "${userName}'s Karmaspace".`,
            },
            {
              role: "user",
              content: context.slice(0, 120000), // Limit context to 120K chars (~30K tokens)
            },
          ],
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(45000), // 45s timeout (generous for large payloads)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
          aiResponse = data.choices[0].message.content;
        }
      } else {
        const errorBody = await response.text().catch(() => "unknown error");
        console.error("[zai-bridge] API error:", response.status, errorBody);
        let detailMsg = errorBody.slice(0, 300);
        try {
          const errJson = JSON.parse(errorBody);
          if (errJson.error?.message) detailMsg = errJson.error.message;
        } catch { /* keep raw */ }

        if (response.status === 429) {
          apiError = `z.ai API rate limited (429): ${detailMsg}. The free tier has usage limits. Wait 30-60 seconds and try again.`;
        } else if (response.status === 401) {
          apiError = `z.ai API auth failed (401): ${detailMsg}. Your API key may be expired. Check Settings → z.ai Bridge.`;
        } else {
          apiError = `z.ai API error (${response.status}): ${detailMsg}`;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[zai-bridge] Failed to send to z.ai:", msg);
      apiError = `Network error sending to z.ai: ${msg}`;
    }

    // 8. Return response — even if z.ai API failed, return context so user can still copy/paste
    return NextResponse.json({
      success: true,
      chatId,
      chatUrl: "https://z.ai/chat",
      context,
      modelName: zaiModel,
      documentsFound: documents.length,
      isNewChat,
      aiResponse: aiResponse || undefined,
      apiError: apiError || undefined,
    });
  } catch (error) {
    console.error("[POST /api/ai/zai-bridge] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
