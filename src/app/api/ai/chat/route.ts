import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, logActivity, getClientIp } from "@/lib/api-auth";
import { buildSystemPrompt } from "@/lib/ai-prompts";
import { chatCompletion, visionCompletion, getGlobalDefaultModel, getVisionModel } from "@/lib/ai-client";
import { getToolsForRole } from "@/lib/ai-tools";
import { executeToolCall, getToolLabel, getToolIcon } from "@/lib/ai-tool-executor";
import type { AiToolCall, AiToolResult } from "@/lib/ai-tools";
import type { AiMessage } from "@/lib/ai-client";

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
        { title: "Phase 1: COLLECT — Extract Project Data", description: "Gather all project information using tools (list_projects, get_project_info), review context, identify gaps and assumptions", commandTag: null, stepOrder: 1 },
        { title: "Phase 2A: Web Research — 5 Categories", description: "Research competitors, market trends, technology best practices, UX patterns, and security requirements", commandTag: null, stepOrder: 2 },
        { title: "Phase 2B: Think Deeper — Scalability & Edge Cases", description: "Analyze scalability considerations, edge cases, security deep dive, performance optimization, and migration strategy", commandTag: null, stepOrder: 3 },
        { title: "Product Requirements Document (PRD)", description: "Define product vision, target audience, feature requirements, user stories, acceptance criteria, scope, and risks", commandTag: "prd", stepOrder: 4 },
        { title: "Technical Requirements Document (TRD)", description: "Define architecture, technology stack, frontend/backend requirements, API specs, security, performance, and testing strategy", commandTag: "trd", stepOrder: 5 },
        { title: "Application Flow Document", description: "Map user journeys, screen flows, core workflows, state management, navigation architecture, and error handling", commandTag: "flow", stepOrder: 6 },
        { title: "UI/UX Design Brief", description: "Define design principles, design system, color palette, typography, component guidelines, screen designs, accessibility, and dark mode", commandTag: "ux", stepOrder: 7 },
        { title: "Backend Schema Document", description: "Design database architecture, entity relationships, schema definitions, data integrity rules, migration strategy, and API mapping", commandTag: "schema", stepOrder: 8 },
        { title: "Implementation Plan", description: "Break down phases, sprint planning, task estimates, resource requirements, risk register, quality gates, deployment plan, and success metrics", commandTag: "plan", stepOrder: 9 },
        { title: "Phase 4: Review & Action Items", description: "Cross-document consistency check, critical decisions requiring approval, open questions, and top 10 priority action items", commandTag: null, stepOrder: 10 },
        { title: "Phase 5: Save & Commit Instructions", description: "Provide recommended file structure for docs/pre-coding/ directory and git commit format with [Zai] /docs prefix", commandTag: null, stepOrder: 11 },
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
      // SUPERADMIN sees all messages — newest first (client will reverse for display)
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
      // Others see only own messages + assistant messages — newest first
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

// Vercel serverless function config — extend timeout for agentic AI loops
export const maxDuration = 60;

// POST /api/ai/chat — Send message and get AI response (with agentic tool-calling loop)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, content, files, fileData, fileName, fileType } = body;

    if (!projectId || !content) {
      return NextResponse.json({ success: false, error: "projectId and content are required" }, { status: 400 });
    }

    // Normalize: support both old single-file and new multi-file format
    const attachedImages: { data: string; type: string; name: string }[] = [];
    if (files && Array.isArray(files) && files.length > 0) {
      // New format: array of { data, type, name }
      for (const f of files) {
        if (f.data && f.type && f.type.startsWith("image/")) {
          attachedImages.push({ data: f.data, type: f.type, name: f.name || "image" });
        }
      }
    } else if (fileData && fileType && fileType.startsWith("image/")) {
      // Legacy single-file format
      attachedImages.push({ data: fileData, type: fileType, name: fileName || "image" });
    }
    const hasImages = attachedImages.length > 0;

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

    // Load user name from DB
    let userName = user.name;
    try {
      const userResult = await client.execute({
        sql: `SELECT name FROM "User" WHERE id = ?`,
        args: [user.id],
      });
      if (userResult.rows.length > 0) {
        userName = userResult.rows[0].name as string;
      }
    } catch {
      // Use token name as fallback
    }

    // Load project info (with status, priority, deadline)
    const projectResult = await client.execute({
      sql: `SELECT name, description, "clientName", status, priority, deadline FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    const project = projectResult.rows[0];

    // Load team member count for this project
    let teamCount: number | undefined;
    try {
      const teamResult = await client.execute({
        sql: `SELECT COUNT(*) as count FROM "ProjectMember" WHERE "projectId" = ? AND "removedAt" IS NULL`,
        args: [projectId],
      });
      teamCount = Number(teamResult.rows[0].count);
    } catch {
      // Non-critical
    }

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

    // Build system prompt with rich context
    const systemPrompt = buildSystemPrompt({
      userName,
      userRole: user.role,
      projectName: project?.name as string | undefined,
      projectDescription: project?.description as string | undefined,
      projectClient: project?.clientName as string | undefined,
      projectStatus: project?.status as string | undefined,
      projectDeadline: project?.deadline as string | null | undefined,
      projectPriority: project?.priority as string | undefined,
      teamCount,
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
    const activeModel = projectModel || getGlobalDefaultModel();
    // For vision, use the appropriate vision-capable model
    const visionModel = hasImages ? getVisionModel(activeModel) : activeModel;

    // ===== Agentic Loop =====
    let aiText: string;
    let aiError = false;
    const toolExecutions: {
      toolName: string;
      label: string;
      icon: string;
      status: "success" | "error" | "running";
      displayMessage: string;
    }[] = [];

    // Tool executor context
    const executorCtx = {
      userId: user.id,
      userRole: user.role,
      userName: userName || user.name,
      tursoClient: client,
    };

    // Get tools for this user's role
    const availableTools = getToolsForRole(user.role);

    // Build initial messages array
    const aiMessages: AiMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of chatHistory) {
      aiMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    const MAX_TOOL_ROUNDS = 5; // Prevent infinite loops
    let round = 0;
    let finalContent = "";

    try {
      if (hasImages) {
        // Vision API for image attachments — no tool calling for vision
        // Build multimodal content: text + all images
        const multimodalContent: { type: string; text?: string; image_url?: { url: string; detail?: string } }[] = [
          { type: "text", text: content },
        ];
        for (const img of attachedImages) {
          multimodalContent.push({
            type: "image_url",
            image_url: { url: `data:${img.type};base64,${img.data}`, detail: "auto" },
          });
        }

        const result = await visionCompletion({
          model: visionModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: multimodalContent,
            },
          ],
        });

        if (!result.success) {
          aiText = `I encountered an issue analyzing the image${attachedImages.length > 1 ? "s" : ""}: ${result.error}`;
          aiError = true;
        } else {
          aiText = result.content;
        }
      } else {
        // ===== Agentic Tool-Calling Loop =====
        while (round < MAX_TOOL_ROUNDS) {
          round++;

          // Call AI with tools
          const result = await chatCompletion({
            messages: aiMessages,
            model: activeModel,
            tools: availableTools.length > 0 ? availableTools as unknown as NonNullable<Parameters<typeof chatCompletion>[0]["tools"]> : undefined,
            tool_choice: availableTools.length > 0 ? "auto" : undefined,
          });

          if (!result.success) {
            aiText = `I encountered an issue connecting to the AI service: ${result.error}`;
            aiError = true;
            break;
          }

          // If no tool calls, we have the final response
          if (!result.tool_calls || result.tool_calls.length === 0) {
            finalContent = result.content;
            break;
          }

          // Add assistant message with tool calls to conversation
          aiMessages.push({
            role: "assistant",
            content: result.content || "",
            tool_calls: result.tool_calls,
          });

          // Execute each tool call
          for (const toolCall of result.tool_calls) {
            const toolName = toolCall.function.name;
            const toolLabel = getToolLabel(toolName);
            const toolIcon = getToolIcon(toolName);

            // Add "running" status
            const execIndex = toolExecutions.length;
            toolExecutions.push({
              toolName,
              label: toolLabel,
              icon: toolIcon,
              status: "running",
              displayMessage: `${toolLabel}...`,
            });

            // Execute the tool
            const toolResult: AiToolResult = await executeToolCall(toolCall, executorCtx);

            // Update execution status
            toolExecutions[execIndex].status = toolResult.success ? "success" : "error";
            toolExecutions[execIndex].displayMessage = toolResult.displayMessage;

            // Add tool result to conversation
            aiMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult.result,
              name: toolName,
            });
          }

          // Loop continues — AI will see tool results and decide next action
        }

        // If we exhausted rounds without final content, generate a fallback
        if (!finalContent && round >= MAX_TOOL_ROUNDS) {
          finalContent = "I completed several actions but reached the maximum number of steps. Here's what I did:\n\n" +
            toolExecutions.map((t) => `- ${t.icon} ${t.displayMessage}`).join("\n") +
            "\n\nIs there anything else you'd like me to do?";
        } else if (!finalContent && toolExecutions.length > 0) {
          // Tool calls happened but AI didn't produce final text — summarize
          finalContent = toolExecutions.map((t) => `${t.icon} ${t.displayMessage}`).join("\n\n");
        }

        aiText = finalContent || "I'm here to help! What would you like me to do?";
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
    const toolSummary = toolExecutions.length > 0
      ? ` (tools used: ${toolExecutions.map((t) => t.toolName).join(", ")})`
      : "";
    await logActivity({
      userId: user.id,
      action: "AI_CHAT_MESSAGE",
      details: `Sent AI chat message in project${project?.name ? ` "${project.name}"` : ""}${command ? ` (command: ${command})` : ""}${toolSummary}`,
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
        toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/chat] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
