import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
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
 * Ensure ProjectDocument table exists. Auto-creates on first use.
 */
let _docTableEnsured = false;
async function ensureProjectDocumentTable(tursoClient: ReturnType<typeof getTursoClient>): Promise<void> {
  if (_docTableEnsured) return;
  try {
    await tursoClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS "ProjectDocument" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "docType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "pdfData" TEXT NOT NULL DEFAULT '',
        "version" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId", "docType")
      )`,
      args: [],
    });
    _docTableEnsured = true;
    console.log("[zai-bridge] ProjectDocument table ensured");
  } catch (err) {
    console.error("[zai-bridge] Failed to create ProjectDocument table:", err);
  }
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

    // 0. Ensure ProjectDocument table exists
    await ensureProjectDocumentTable(client);

    // 1. Fetch project info
    const projectResult = await client.execute({
      sql: `SELECT name, description, "clientName", status, priority, deadline FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    const project = projectResult.rows[0];
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // 2. Load user name from DB
    let userName = user.name || "User";
    try {
      const userResult = await client.execute({
        sql: `SELECT name FROM "User" WHERE id = ?`,
        args: [user.id],
      });
      if (userResult.rows.length > 0) userName = userResult.rows[0].name as string;
    } catch { /* fallback */ }

    // 3. Fetch ALL ProjectDocument rows for this project (any count — no minimum)
    const docsResult = await client.execute({
      sql: `SELECT "docType", title, content, version FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" IN ('prd', 'trd', 'flow', 'ux', 'schema', 'plan') ORDER BY "docType"`,
      args: [projectId],
    });

    const documents: { docType: string; title: string; content: string; version: number }[] =
      docsResult.rows.map((row) => ({
        docType: row.docType as string,
        title: row.title as string,
        content: row.content as string,
        version: Number(row.version),
      }));

    // 4. Fetch ALL chat history for this project
    const chatHistoryResult = await client.execute({
      sql: `SELECT role, content, "timestamp" FROM "AiChat" WHERE "projectId" = ? ORDER BY "timestamp" ASC`,
      args: [projectId],
    });

    // 5. Fetch project settings for context
    let githubRepoUrl = "";
    try {
      const repoResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
        args: [],
      });
      if (repoResult.rows.length > 0) githubRepoUrl = repoResult.rows[0].value as string;
    } catch { /* non-critical */ }

    // 6. Fetch z.ai bridge login method + credentials
    const methodResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_LOGIN_METHOD'`,
      args: [],
    });
    const loginMethod = (methodResult.rows.length > 0 && methodResult.rows[0].value)
      ? (methodResult.rows[0].value as string)
      : "email";

    let bearerToken = "";
    if (loginMethod === "google") {
      const tokenResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_GOOGLE_TOKEN'`,
        args: [],
      });
      if (tokenResult.rows.length === 0 || !tokenResult.rows[0].value) {
        return NextResponse.json({
          success: false,
          error: "z.ai Bridge is not configured. Please ask your Super Admin to set up the Google login token in Settings.",
        });
      }
      try { bearerToken = decrypt(tokenResult.rows[0].value as string); }
      catch { bearerToken = tokenResult.rows[0].value as string; }
    } else {
      const emailResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_EMAIL'`,
        args: [],
      });
      const passwordResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_PASSWORD'`,
        args: [],
      });
      if (emailResult.rows.length === 0 || !emailResult.rows[0].value) {
        return NextResponse.json({
          success: false,
          error: "z.ai Bridge is not configured. Please ask your Super Admin to set up the z.ai login credentials in Settings.",
        });
      }
      if (passwordResult.rows.length === 0 || !passwordResult.rows[0].value) {
        return NextResponse.json({
          success: false,
          error: "z.ai Bridge is not configured. Please ask your Super Admin to set up the z.ai login credentials in Settings.",
        });
      }
      try { bearerToken = decrypt(passwordResult.rows[0].value as string); }
      catch { bearerToken = passwordResult.rows[0].value as string; }
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

    // 7. Check for existing chat mapping — always create fresh session per button click
    const chatKey = `ZAI_CHAT:${projectId}`;
    const chatId = crypto.randomUUID();
    const isNewChat = true;
    // Save the mapping (overwrites any previous session)
    await client.execute({
      sql: `INSERT OR REPLACE INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
      args: [chatKey, chatId],
    });

    // 8. Build comprehensive project context
    const projectName = project.name as string;
    const projectDescription = project.description as string;
    const projectPriority = project.priority as string;
    const projectDeadline = project.deadline as string;
    const projectClient = project.clientName as string;
    const projectStatus = project.status as string;

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
      const truncatedContent = docContent.length > 8000
        ? docContent.slice(0, 8000) + "\n\n... (truncated)"
        : docContent;
      context += `## ${label} (v${doc.version})\n\n${truncatedContent}\n\n---\n\n`;
    }

    // Add ALL chat history
    if (chatHistoryResult.rows.length > 0) {
      context += `## KarmaSpace Chat History (${chatHistoryResult.rows.length} messages)\n\n`;
      for (const msgRow of chatHistoryResult.rows) {
        const role = msgRow.role as string;
        const msgContent = (msgRow.content as string) || "";
        const truncatedMsg = msgContent.length > 2000
          ? msgContent.slice(0, 2000) + "\n\n... (truncated)"
          : msgContent;
        if (role === "user") {
          context += `**User:** ${truncatedMsg}\n\n`;
        } else {
          context += `**Karma Space AI:** ${truncatedMsg}\n\n`;
        }
      }
      context += `---\n\n`;
    }

    // 9. Send context to z.ai via API — create agentic chat with user's Karmaspace name
    const chatName = `${userName}'s Karmaspace`;
    let aiResponse = "";
    try {
      const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${bearerToken}`,
          "X-Chat-Id": chatId,
        },
        body: JSON.stringify({
          model: zaiModel,
          messages: [
            {
              role: "system",
              content: `You are Super Z, an advanced agentic AI assistant built by Z.ai. You have received a complete project brief from KarmaBoard with pre-coding documents (PRD, TRD, Flow, UX, Schema, Plan) and the full KarmaSpace chat history. You are now in agentic mode — proactively analyze the project, identify next steps, and help the user build this project. Start by acknowledging the project brief, summarizing key requirements, and proposing an implementation roadmap. The chat name is "${chatName}".`,
            },
            {
              role: "user",
              content: `Here is my complete project brief from KarmaBoard with all generated documents and the full chat history. Please review everything and help me build this project in agentic mode:\n\n${context.slice(0, 120000)}`,
            },
          ],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
          aiResponse = data.choices[0].message.content;
        }
      } else {
        const errText = await response.text().catch(() => "");
        console.error("[zai-bridge] API error:", response.status, errText);
      }
    } catch (err) {
      console.error("[zai-bridge] Failed to send to z.ai:", err);
    }

    // 10. Log activity
    try {
      await logActivity({
        userId: user.id,
        action: "ZAI_BRIDGE_LAUNCH",
        details: `Launched Karmaspace Codex for project "${projectName}" (${documents.length} docs, ${chatHistoryResult.rows.length} chat messages)`,
        entity: "ai_chat",
        entityId: projectId,
        ipAddress: getClientIp(request),
        tursoClient: client,
      });
    } catch (logErr) {
      console.error("[zai-bridge] Activity log failed (non-critical):", logErr);
    }

    // 11. Return response with chat URL
    return NextResponse.json({
      success: true,
      chatId,
      chatUrl: `https://z.ai/chat/${chatId}`,
      chatName,
      context,
      modelName: zaiModel,
      documentsFound: documents.length,
      chatMessagesFound: chatHistoryResult.rows.length,
      isNewChat,
      aiResponse: aiResponse || undefined,
    });
  } catch (error) {
    console.error("[POST /api/ai/zai-bridge] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
