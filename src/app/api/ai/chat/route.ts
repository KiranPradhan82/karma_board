import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, logActivity, getClientIp } from "@/lib/api-auth";
import { buildSystemPrompt } from "@/lib/ai-prompts";
import { chatCompletion, visionCompletion, getGlobalDefaultModel } from "@/lib/ai-client";

interface RouteContext {
  params: Promise<{}>;
}

/**
 * Check if a user has access to a project.
 * SUPERADMIN always has access. Others must be in ProjectMember.
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

/**
 * Ensure AI tables exist in Turso. Runs silently on first use.
 */
async function ensureAiTables(tursoClient: ReturnType<typeof getTursoClient>): Promise<void> {
  try {
    await tursoClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS "AiProtocol" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "isGlobal" BOOLEAN NOT NULL DEFAULT 0,
        "projectId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AiProtocol_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    });
    await tursoClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS "AiProtocolStep" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "protocolId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "commandTag" TEXT,
        "stepOrder" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AiProtocolStep_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "AiProtocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      args: [],
    });
    await tursoClient.execute({
      sql: `CREATE INDEX IF NOT EXISTS "AiProtocolStep_protocolId_idx" ON "AiProtocolStep"("protocolId")`,
      args: [],
    });

    // Seed default protocol if not exists
    const existing = await tursoClient.execute({
      sql: `SELECT id FROM "AiProtocol" WHERE name = ?`,
      args: ["Pre-coding Documentation"],
    });
    if (existing.rows.length === 0) {
      const protocolId = crypto.randomUUID();
      await tursoClient.execute({
        sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 1, NULL, datetime('now'), datetime('now'))`,
        args: [protocolId, "Pre-coding Documentation", "Complete pre-coding documentation generation protocol.", 1, null],
      });
      const defaultSteps = [
        { title: "Product Requirements Document", description: "Define project goals, target audience, features, user stories, and acceptance criteria", commandTag: "prd", stepOrder: 1 },
        { title: "Technical Requirements Document", description: "Define architecture, technology stack, API specs, and technical constraints", commandTag: "trd", stepOrder: 2 },
        { title: "Application Flow", description: "Map user journeys, screen flows, core workflows, and navigation architecture", commandTag: "flow", stepOrder: 3 },
        { title: "UI/UX Design Brief", description: "Define design system, visual language, component guidelines, and responsive strategy", commandTag: "ux", stepOrder: 4 },
        { title: "Backend Schema", description: "Design database architecture, entity relationships, and schema definitions", commandTag: "schema", stepOrder: 5 },
        { title: "Implementation Plan", description: "Break down phases, sprints, task estimates, dependencies, and quality gates", commandTag: "plan", stepOrder: 6 },
        { title: "Review & Action Items", description: "Summarize all documents, list critical decisions, open questions, and next steps", commandTag: null, stepOrder: 7 },
      ];
      for (const step of defaultSteps) {
        await tursoClient.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [crypto.randomUUID(), protocolId, step.title, step.description, step.commandTag, step.stepOrder],
        });
      }
    }
  } catch (err) {
    console.error("[ensureAiTables] Migration error (non-fatal):", err);
  }
}

// GET /api/ai/chat — Paginated chat history
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    // Check project access
    const canAccess = await hasProjectAccess(user.id, user.role, projectId);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "You don't have access to this project" }, { status: 403 });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const client = getTursoClient();
    const offset = (page - 1) * limit;

    let messagesResult;

    if (user.role === "SUPERADMIN") {
      // SUPERADMIN sees all messages
      messagesResult = await client.execute({
        sql: `SELECT m.*, u.name as userName
              FROM "AiChat" m
              LEFT JOIN "User" u ON m."userId" = u.id
              WHERE m."projectId" = ?
              ORDER BY m."timestamp" DESC
              LIMIT ? OFFSET ?`,
        args: [projectId, limit, offset],
      });
    } else {
      // Others see only own messages + assistant messages
      messagesResult = await client.execute({
        sql: `SELECT m.*, u.name as userName
              FROM "AiChat" m
              LEFT JOIN "User" u ON m."userId" = u.id
              WHERE m."projectId" = ? AND (m."userId" = ? OR m."role" = 'assistant')
              ORDER BY m."timestamp" DESC
              LIMIT ? OFFSET ?`,
        args: [projectId, user.id, limit, offset],
      });
    }

    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "AiChat" WHERE "projectId" = ?`,
      args: [projectId],
    });
    const total = Number(countResult.rows[0].total);

    const messages = messagesResult.rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      projectId: row.projectId,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      userName: row.userName,
    }));

    return NextResponse.json({
      success: true,
      data: {
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/chat] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/ai/chat — Send message and get AI response
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, content, fileData, fileName, fileType } = body;

    if (!projectId || !content) {
      return NextResponse.json({ success: false, error: "projectId and content are required" }, { status: 400 });
    }

    // Check project access
    const canAccess = await hasProjectAccess(user.id, user.role, projectId);
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "You don't have access to this project" }, { status: 403 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Auto-migrate AI tables if they don't exist
    await ensureAiTables(client);

    // Save user message
    const userMsgId = crypto.randomUUID();
    await client.execute({
      sql: `INSERT INTO "AiChat" (id, "userId", "projectId", "role", "content", "timestamp")
            VALUES (?, ?, ?, 'user', ?, datetime('now'))`,
      args: [userMsgId, user.id, projectId, content],
    });

    // Detect command
    const trimmed = content.trim();
    const command = trimmed.startsWith("/") ? trimmed.split(/[\s\n]/)[0] : undefined;

    // Load last 20 chat messages for context
    const historyResult = await client.execute({
      sql: `SELECT role, content FROM "AiChat"
            WHERE "projectId" = ?
            ORDER BY "timestamp" DESC
            LIMIT 20`,
      args: [projectId],
    });
    const chatHistory = historyResult.rows.reverse().map((row) => ({
      role: row.role,
      content: row.content,
    }));

    // Load project info
    const projectResult = await client.execute({
      sql: `SELECT name, description, "clientName" FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    const project = projectResult.rows[0];

    // Load protocol steps for /docs command
    let protocolSteps: { title: string; description?: string; commandTag?: string }[] = [];
    if (command === "/docs") {
      try {
        const stepsResult = await client.execute({
          sql: `SELECT ps.title, ps.description, ps."commandTag"
                FROM "AiProtocolStep" ps
                JOIN "AiProtocol" p ON ps."protocolId" = p.id
                WHERE (p."isGlobal" = 1 OR p."projectId" = ?)
                ORDER BY ps."stepOrder" ASC`,
          args: [projectId],
        });
        protocolSteps = stepsResult.rows.map((row) => ({
          title: row.title as string,
          description: (row.description as string) || undefined,
          commandTag: (row.commandTag as string) || undefined,
        }));
      } catch (err) {
        console.error("[POST /api/ai/chat] Error loading protocol steps:", err);
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      projectName: project?.name as string | undefined,
      projectDescription: project?.description as string | undefined,
      projectClient: project?.clientName as string | undefined,
      protocolSteps: protocolSteps.length > 0 ? protocolSteps : undefined,
      command,
    });

    // Resolve model: per-project setting > env var > global default
    let projectModel: string | null = null;
    try {
      const modelSetting = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = ?`,
        args: [`ai_model:${projectId}`],
      });
      if (modelSetting.rows.length > 0 && modelSetting.rows[0].value) {
        projectModel = modelSetting.rows[0].value as string;
      }
    } catch {
      // Settings table might not exist yet, fall back to default
    }
    const activeModel = projectModel || process.env.AI_VISION_MODEL || getGlobalDefaultModel();

    // Call AI
    let aiText: string;
    let aiError = false;

    try {
      if (fileData && fileType && fileType.startsWith("image/")) {
        // Vision API for image attachments
        const result = await visionCompletion({
          model: activeModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: content },
                { type: "image_url", image_url: { url: `data:${fileType};base64,${fileData}` } },
              ],
            },
          ],
        });

        if (!result.success) {
          aiText = `I encountered an issue analyzing the image: ${result.error}`;
          aiError = true;
        } else {
          aiText = result.content;
        }
      } else {
        // Standard text chat
        const aiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: systemPrompt },
        ];

        for (const msg of chatHistory) {
          aiMessages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }

        const result = await chatCompletion({
          messages: aiMessages,
          model: activeModel,
        });

        if (!result.success) {
          aiText = `I encountered an issue connecting to the AI service: ${result.error}`;
          aiError = true;
        } else {
          aiText = result.content;
        }
      }
    } catch (err) {
      console.error("[POST /api/ai/chat] AI call error:", err);
      aiText = "I encountered an unexpected error with the AI service. Please try again in a moment.";
      aiError = true;
    }

    // Save AI response
    const aiMsgId = crypto.randomUUID();
    await client.execute({
      sql: `INSERT INTO "AiChat" (id, "userId", "projectId", "role", "content", "timestamp")
            VALUES (?, ?, ?, 'assistant', ?, datetime('now'))`,
      args: [aiMsgId, user.id, projectId, aiText],
    });

    // Log activity
    await logActivity({
      userId: user.id,
      action: "AI_CHAT_MESSAGE",
      details: `Sent AI chat message in project${project?.name ? ` "${project.name}"` : ""}${command ? ` (command: ${command})` : ""}`,
      entity: "ai_chat",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        userMessage: { id: userMsgId, role: "user", content, projectId },
        aiMessage: { id: aiMsgId, role: "assistant", content: aiText, projectId },
        error: aiError || undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/chat] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
