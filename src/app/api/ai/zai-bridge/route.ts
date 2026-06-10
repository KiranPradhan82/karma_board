import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";
import { sendChunkedContext } from "@/lib/zai-chunker";

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

const DOC_LABELS: Record<string, string> = {
  prd: "Product Requirements Document",
  trd: "Technical Requirements Document",
  flow: "Application Flow Document",
  ux: "UI/UX Design Brief",
  schema: "Backend Schema Document",
  plan: "Implementation Plan",
};

// 120 seconds — chunked sending with delays needs more time
export const maxDuration = 120;

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
        error: "No project documents found. Please generate documents first using /docs command.",
      });
    }

    const documents = docsResult.rows.map((row) => ({
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

    // 4. Fetch z.ai bridge API key
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
      await client.execute({
        sql: `INSERT OR REPLACE INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
        args: [chatKey, chatId],
      });
    }

    // 6. Build comprehensive project context
    let userName = user.name || "User";
    try {
      const userResult = await client.execute({
        sql: `SELECT name FROM "User" WHERE id = ?`,
        args: [user.id],
      });
      if (userResult.rows.length > 0) userName = userResult.rows[0].name as string;
    } catch { /* fallback */ }

    let context = `# ${project.name} — Complete Project Brief\n\n`;
    context += `**Project:** ${project.name}\n`;
    if (project.description) context += `**Description:** ${project.description}\n`;
    if (project.clientName) context += `**Client:** ${project.clientName}\n`;
    if (project.status) context += `**Status:** ${project.status}\n`;
    if (project.priority) context += `**Priority:** ${project.priority}\n`;
    if (project.deadline) context += `**Deadline:** ${project.deadline}\n`;
    if (githubRepoUrl) context += `**GitHub Repo:** ${githubRepoUrl}\n`;
    context += `**Prepared by:** ${userName}\n`;
    context += `\n---\n\n`;

    for (const doc of documents) {
      const label = DOC_LABELS[doc.docType] || doc.docType.toUpperCase();
      const docContent = doc.content || "(empty)";
      const truncatedContent = docContent.length > 8000
        ? docContent.slice(0, 8000) + "\n\n... (truncated)"
        : docContent;
      context += `## ${label} (v${doc.version})\n\n${truncatedContent}\n\n---\n\n`;
    }

    // 7. Send context to z.ai via chunked iteration
    const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const systemPrompt = `You are a senior full-stack developer AI assistant. You will receive a complete project brief with all generated documentation (PRD, TRD, Flow, UX, Schema, Plan). Help the user build this project by understanding all the requirements and providing implementation guidance. The chat name is "${userName}'s Karmaspace".`;

    const result = await sendChunkedContext({
      context: context.slice(0, 120000),
      systemPrompt,
      chatUrl,
      bearerToken,
      model: zaiModel,
    });

    // 8. Return response — even if z.ai API failed, return context so user can copy/paste
    return NextResponse.json({
      success: true,
      chatId,
      chatUrl: "https://z.ai/chat",
      context,
      modelName: zaiModel,
      documentsFound: documents.length,
      isNewChat,
      aiResponse: result.aiResponse || undefined,
      apiError: result.apiError || undefined,
      chunksTotal: result.totalChunks,
      chunksSent: result.chunksSent,
      chunkProgress: result.progress,
    });
  } catch (error) {
    console.error("[POST /api/ai/zai-bridge] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}