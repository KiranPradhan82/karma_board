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

const DOC_LABELS: Record<string, string> = {
  prd: "Product Requirements Document",
  trd: "Technical Requirements Document",
  flow: "Application Flow Document",
  ux: "UI/UX Design Brief",
  schema: "Backend Schema Document",
  plan: "Implementation Plan",
  requirements: "Product Requirements",
};

/**
 * Document signature keywords used to detect docs embedded in chat messages.
 * Each doc type has 3+ keywords that must be present.
 */
const DOC_SIGNATURES: Record<string, string[]> = {
  prd: ["Product Requirements Document", "Executive Summary", "Feature Requirements", "User Stories", "Target Audience", "Product Vision"],
  trd: ["Technical Requirements Document", "Architecture Overview", "Technology Stack", "API Specification", "Security Requirements"],
  flow: ["Application Flow Document", "User Journey", "Screen Flow", "Navigation Architecture", "State Management"],
  ux: ["UI/UX Design Brief", "Design Principles", "Design System", "Color Palette", "Typography", "Component Guidelines"],
  schema: ["Backend Schema Document", "Entity Relationship", "Schema Definitions", "Enum Types", "Data Integrity Rules"],
  plan: ["Implementation Plan", "Phase Breakdown", "Task Breakdown", "Sprint Planning", "Resource Requirements"],
};

/**
 * Detect document type from AI chat message content based on keyword signatures.
 * Returns the doc type string or null.
 */
function detectDocType(content: string): string | null {
  if (content.length < 1500) return null;
  const lower = content.toLowerCase();
  for (const [docType, keywords] of Object.entries(DOC_SIGNATURES)) {
    const matchCount = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (matchCount >= 3) return docType;
  }
  return null;
}

export const maxDuration = 60;

// POST /api/ai/zai-bridge — Build project context and send to z.ai
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

    // 1. Fetch project info (isolated try/catch)
    let project: Record<string, unknown> | null = null;
    try {
      const projectResult = await client.execute({
        sql: `SELECT name, description, "clientName", status, priority, deadline FROM "Project" WHERE id = ?`,
        args: [projectId],
      });
      project = projectResult.rows[0] || null;
    } catch (err) {
      console.error("[zai-bridge] Failed to fetch project:", err);
      return NextResponse.json({ success: false, error: "Failed to fetch project info" }, { status: 500 });
    }
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

    // 3. Fetch documents — try ProjectDocument table first, then fall back to AiChat scanning
    const documents: { docType: string; title: string; content: string; version: number }[] = [];
    let docsSource = "none";

    try {
      const docsResult = await client.execute({
        sql: `SELECT "docType", title, content, version FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" IN ('prd', 'trd', 'flow', 'ux', 'schema', 'plan') ORDER BY "docType"`,
        args: [projectId],
      });
      for (const row of docsResult.rows) {
        documents.push({
          docType: row.docType as string,
          title: row.title as string,
          content: row.content as string,
          version: Number(row.version),
        });
      }
      if (documents.length > 0) docsSource = "projectDocument";
    } catch (err) {
      console.warn("[zai-bridge] ProjectDocument query failed, will scan AiChat:", err);
    }

    // 3b. If no docs from ProjectDocument table, scan AiChat for document content
    if (documents.length === 0) {
      try {
        const chatDocsResult = await client.execute({
          sql: `SELECT role, content, "timestamp" FROM "AiChat" WHERE "projectId" = ? AND role = 'assistant' ORDER BY "timestamp" ASC`,
          args: [projectId],
        });
        const seenTypes = new Set<string>();
        for (const row of chatDocsResult.rows) {
          const content = (row.content as string) || "";
          const detectedType = detectDocType(content);
          if (detectedType && !seenTypes.has(detectedType)) {
            seenTypes.add(detectedType);
            const title = content.split("\n").find(l => l.trim().startsWith("#"))
              ?.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().slice(0, 100)
              || (DOC_LABELS[detectedType] || detectedType.toUpperCase());
            documents.push({
              docType: detectedType,
              title,
              content,
              version: 1,
            });
          }
        }
        if (documents.length > 0) docsSource = "aiChatScan";
      } catch (err) {
        console.warn("[zai-bridge] AiChat doc scan failed:", err);
      }
    }

    // 4. Fetch ALL chat history for this project (isolated try/catch)
    let chatHistoryRows: { role: string; content: string; timestamp: string }[] = [];
    try {
      const chatHistoryResult = await client.execute({
        sql: `SELECT role, content, "timestamp" FROM "AiChat" WHERE "projectId" = ? ORDER BY "timestamp" ASC`,
        args: [projectId],
      });
      chatHistoryRows = chatHistoryResult.rows.map((row) => ({
        role: row.role as string,
        content: (row.content as string) || "",
        timestamp: row.timestamp as string,
      }));
    } catch (err) {
      console.warn("[zai-bridge] AiChat query failed:", err);
    }

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
    let loginMethod = "email";
    try {
      const methodResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_LOGIN_METHOD'`,
        args: [],
      });
      if (methodResult.rows.length > 0 && methodResult.rows[0].value) {
        loginMethod = methodResult.rows[0].value as string;
      }
    } catch { /* default to email */ }

    let bearerToken = "";
    if (loginMethod === "google") {
      try {
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
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: "Failed to read z.ai Bridge settings from database.",
        });
      }
    } else {
      try {
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
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: "Failed to read z.ai Bridge settings from database.",
        });
      }
    }

    let baseUrl = "https://api.z.ai/api/paas/v4";
    let zaiModel = "glm-4.7-flash";
    try {
      const baseUrlResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_BASE_URL'`,
        args: [],
      });
      if (baseUrlResult.rows.length > 0 && baseUrlResult.rows[0].value) {
        baseUrl = baseUrlResult.rows[0].value as string;
      }
      const modelResult = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'ZAI_BRIDGE_MODEL'`,
        args: [],
      });
      if (modelResult.rows.length > 0 && modelResult.rows[0].value) {
        zaiModel = modelResult.rows[0].value as string;
      }
    } catch { /* use defaults */ }

    // 7. Create fresh session per button click
    const chatKey = `ZAI_CHAT:${projectId}`;
    const chatId = crypto.randomUUID();
    const isNewChat = true;
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
        args: [chatKey, chatId],
      });
    } catch { /* non-critical */ }

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

    // Add ALL chat history (exclude the very long AI doc responses to save space — they're already included above)
    if (chatHistoryRows.length > 0) {
      // Deduplicate: skip assistant messages that are already included as documents
      const docContents = new Set(documents.map(d => d.content.slice(0, 200)));
      const uniqueMessages = chatHistoryRows.filter(msg => {
        if (msg.role === "assistant" && docContents.has(msg.content.slice(0, 200))) return false;
        return true;
      });

      if (uniqueMessages.length > 0) {
        context += `## KarmaSpace Chat History (${uniqueMessages.length} messages)\n\n`;
        for (const msg of uniqueMessages) {
          const truncatedMsg = msg.content.length > 2000
            ? msg.content.slice(0, 2000) + "\n\n... (truncated)"
            : msg.content;
          if (msg.role === "user") {
            context += `**User:** ${truncatedMsg}\n\n`;
          } else {
            context += `**Karma Space AI:** ${truncatedMsg}\n\n`;
          }
        }
        context += `---\n\n`;
      }
    }

    // 9. Send context to z.ai via API
    const chatName = `${userName}'s Karmaspace`;
    let aiResponse = "";
    let apiError = "";
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
        signal: AbortSignal.timeout(45000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
          aiResponse = data.choices[0].message.content;
        } else {
          apiError = "z.ai returned an empty response";
        }
      } else {
        const errText = await response.text().catch(() => "Unknown error");
        apiError = `z.ai API error (${response.status}): ${errText.slice(0, 300)}`;
        console.error("[zai-bridge] API error:", response.status, errText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      apiError = `Failed to reach z.ai: ${msg}`;
      console.error("[zai-bridge] Failed to send to z.ai:", err);
    }

    // 10. Log activity
    try {
      await logActivity({
        userId: user.id,
        action: "ZAI_BRIDGE_LAUNCH",
        details: `Launched Karmaspace Codex for project "${projectName}" (${documents.length} docs from ${docsSource}, ${chatHistoryRows.length} chat messages)`,
        entity: "ai_chat",
        entityId: projectId,
        ipAddress: getClientIp(request),
        tursoClient: client,
      });
    } catch (logErr) {
      console.error("[zai-bridge] Activity log failed (non-critical):", logErr);
    }

    // 11. Return response with full details
    return NextResponse.json({
      success: true,
      chatId,
      chatUrl: `https://z.ai`,
      chatName,
      context,
      modelName: zaiModel,
      documentsFound: documents.length,
      docsSource,
      chatMessagesFound: chatHistoryRows.length,
      isNewChat,
      aiResponse: aiResponse || undefined,
      apiError: apiError || undefined,
    });
  } catch (error) {
    console.error("[POST /api/ai/zai-bridge] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
