import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, logActivity, getClientIp } from "@/lib/api-auth";
import { generatePdfBase64 } from "@/lib/generate-pdf";
import { buildSystemPrompt } from "@/lib/ai-prompts";
import { chatCompletion, visionCompletion, getGlobalDefaultModel, getVisionModel, estimatePromptTokens, findBestModelForPrompt, getFallbackModels, getModelCapability } from "@/lib/ai-client";
import { getToolsForRole } from "@/lib/ai-tools";
import { executeToolCall, getToolLabel, getToolIcon } from "@/lib/ai-tool-executor";
import type { AiToolCall, AiToolResult } from "@/lib/ai-tools";
import type { AiMessage } from "@/lib/ai-client";
import { pushFile, pushBinaryFile } from "@/lib/github-client";
import { decrypt } from "@/lib/encryption";

// ===== Document type mapping =====
const DOC_TYPE_MAP: Record<string, string> = {
  "/prd": "prd",
  "/trd": "trd",
  "/flow": "flow",
  "/ux": "ux",
  "/schema": "schema",
  "/plan": "plan",
};

// Document keyword signatures for detecting update-type messages
const DOC_SIGNATURES = [
  { label: "prd", keywords: ["Product Requirements Document", "Executive Summary", "Feature Requirements", "User Stories", "Target Audience", "Product Vision", "Non-Functional Requirements"] },
  { label: "trd", keywords: ["Technical Requirements Document", "Architecture Overview", "Technology Stack", "API Specification", "Security Requirements", "Performance Requirements"] },
  { label: "flow", keywords: ["Application Flow Document", "User Journey", "Screen Flow", "Navigation Architecture", "State Management", "Interaction Patterns"] },
  { label: "ux", keywords: ["UI/UX Design Brief", "Design Principles", "Design System", "Color Palette", "Typography", "Component Guidelines", "Accessibility"] },
  { label: "schema", keywords: ["Backend Schema Document", "Entity Relationship", "Schema Definitions", "Enum Types", "Data Integrity Rules", "Seed Data"] },
  { label: "plan", keywords: ["Implementation Plan", "Phase Breakdown", "Task Breakdown", "Sprint Planning", "Resource Requirements", "Risk Register", "Quality Gates"] },
];

function detectDocTypeFromContent(content: string): string | null {
  if (content.length < 1500) return null;
  const lower = content.toLowerCase();
  let bestMatch = "";
  let bestCount = 0;
  for (const sig of DOC_SIGNATURES) {
    const count = sig.keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (count >= 3 && count > bestCount) {
      bestCount = count;
      bestMatch = sig.label;
    }
  }
  return bestMatch || null;
}

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
 * Ensure AI tables exist in Turso. Runs silently on first use only.
 * Uses a singleton guard to avoid re-running on every request.
 */
let _tablesEnsured = false;
async function ensureAiTables(tursoClient: ReturnType<typeof getTursoClient>): Promise<void> {
  if (_tablesEnsured) return; // Already done this session
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

    // Create default protocol only if it doesn't exist
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

      // Seed with 11-step phased protocol
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
      console.log("[ensureAiTables] Seeded default 11-step protocol");
    } else {
      console.log("[ensureAiTables] Protocol tables already exist, skipping");
    }

    _tablesEnsured = true;
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
// /docs with tool calling + retry may need up to 120s
export const maxDuration = 120;

// POST /api/ai/chat — Send message and get AI response (with agentic tool-calling loop)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const rawBody = await request.json();
    const { projectId, content, files, fileData, fileName, fileType } = rawBody as { projectId: string; content: string; files?: unknown[]; fileData?: string; fileName?: string; fileType?: string };

    if (!projectId || !content) {
      return NextResponse.json({ success: false, error: "projectId and content are required" }, { status: 400 });
    }

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

    // Detect command type (needed before loading history to determine history limit)
    const isDocCommand = !!command && ["/docs", "/prd", "/trd", "/flow", "/ux", "/schema", "/plan", "/init"].includes(command);

    // Load recent chat messages for context
    // For doc commands: only last 6 messages (saves tokens, avoids bloated context)
    // For regular chat: last 20 messages for natural conversation flow
    const historyLimit = isDocCommand ? 6 : 20;
    const historyResult = await client.execute({
      sql: `SELECT role, content FROM "AiChat"
            WHERE "projectId" = ?
            ORDER BY "timestamp" DESC
            LIMIT ?`,
      args: [projectId, historyLimit],
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

    // Resolve model: per-project setting > auto-selection > env var > global default
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

    // Auto-select model for doc commands if user hasn't explicitly chosen one
    // GLM-4-Flash: FREE permanently, 128K context, 16K output, function calling support
    // Perfect for doc generation — large output window + free + reliable
    const DOC_AUTO_MODEL = "glm-4-flash";
    let activeModel: string;
    let modelAutoSelected = false;
    if (projectModel) {
      // User explicitly chose a model — respect it
      activeModel = projectModel;
    } else if (isDocCommand) {
      // Auto-select the best model for doc generation
      activeModel = DOC_AUTO_MODEL;
      modelAutoSelected = true;
    } else {
      activeModel = getGlobalDefaultModel();
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

    // ===== Determine max_tokens based on model capability =====
    // Use the model's actual max_output_tokens — NO artificial caps.
    // For /docs: use the full model output (important: GLM-4-Flash has 16K, which is enough for one doc)
    // For individual doc commands: use 90% of max to leave room for formatting
    // For regular chat: use 4096 (plenty for conversational responses)
    const modelCap = getModelCapability(activeModel);
    const modelMaxTokens = modelCap?.maxOutputTokens || 4096;
    let maxTokens: number;
    if (command === "/docs" || command === "/init") {
      maxTokens = modelMaxTokens; // Use full output for /docs and /init
    } else if (isDocCommand) {
      maxTokens = Math.floor(modelMaxTokens * 0.9); // 90% for individual docs
    } else {
      maxTokens = 4096; // Regular chat doesn't need huge output
    }

    // Get tools for this user's role
    // For doc commands: ONLY pass list_projects and get_project_info (read-only data tools)
    // web_search is REMOVED — it's a knowledge-based stub that wastes agentic loop rounds
    // create/update/add_member are irrelevant for doc generation
    // For /init: add save_github_config tool so AI can save credentials
    let availableTools = getToolsForRole(user.role);
    if (isDocCommand && command !== "/init") {
      availableTools = availableTools.filter((tool) =>
        ["list_projects", "get_project_info"].includes(tool.function.name)
      );
    } else if (command === "/init") {
      availableTools = availableTools.filter((tool) =>
        ["save_github_config"].includes(tool.function.name)
      );
    }

    // For vision, use the appropriate vision-capable model
    const visionModel = hasImages ? getVisionModel(activeModel) : activeModel;

    // ===== Auto-Route: Check if prompt fits the selected model =====
    let modelAutoRouted = false;
    let modelRouteReason = "";
    try {
      const estimatedTokens = estimatePromptTokens(
        [{ role: "system", content: systemPrompt }, ...chatHistory.map((m) => ({ role: String(m.role), content: String(m.content) }))],
        availableTools.length > 0 ? availableTools : undefined
      );
      const route = findBestModelForPrompt(estimatedTokens, activeModel, {
        tools: !hasImages && availableTools.length > 0,
        vision: hasImages,
      });
      if (route.autoRouted) {
        console.log(`[AI Auto-Route] ${route.reason}`);
        console.log(`[AI Auto-Route] Switching: ${activeModel} -> ${route.model}`);
        activeModel = route.model;
        modelAutoRouted = true;
        modelRouteReason = route.reason;
      } else {
        console.log(`[AI Model] Using ${activeModel} (no routing needed, ~${estimatedTokens.toLocaleString()} tokens estimated)`);
      }
    } catch (routeErr) {
      console.error("[AI Auto-Route] Routing check failed, using selected model:", routeErr);
    }

    // ===== Agentic Loop Setup =====
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

    const MAX_TOOL_ROUNDS = isDocCommand ? 4 : 5; // Reduced from 8 — /docs should WRITE, not loop on tools
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
        // ===== Agentic Tool-Calling Loop with Provider Fallback =====
        // Helper: call AI with automatic fallback on 429/413/401 errors
        const callWithFallback = async (
          messages: AiMessage[],
          model: string,
          maxTok: number,
          tools?: Parameters<typeof chatCompletion>[0]["tools"],
          toolChoice?: Parameters<typeof chatCompletion>[0]["tool_choice"],
          label?: string,
        ) => {
          let result = await chatCompletion({
            messages,
            model,
            maxTokens: maxTok,
            tools,
            tool_choice: toolChoice,
          });

          // If API error (4xx/5xx) — try fallback providers
          if (!result.success && result.error && /status [45]\d\d/.test(result.error)) {
            const fallbacks = getFallbackModels(model, {
              tools: !!tools,
              vision: false,
            });
            console.log(`[AI Fallback${label ? " " + label : ""}] ${model} failed (${result.error?.slice(0, 60)}). Trying ${fallbacks.length} fallback models: ${fallbacks.join(", ")}`);

            for (const fallbackModel of fallbacks.slice(0, 4)) { // max 4 fallback attempts (increased for more providers)
              const fbCap = getModelCapability(fallbackModel);
              console.log(`[AI Fallback] Trying ${fallbackModel} (${fbCap?.category}, ${fbCap?.contextWindow})...`);
              const fbResult = await chatCompletion({
                messages,
                model: fallbackModel,
                maxTokens: maxTok,
                tools,
                tool_choice: toolChoice,
              });
              if (fbResult.success) {
                console.log(`[AI Fallback] Success with ${fallbackModel}!`);
                return { ...fbResult, _fallbackModel: fallbackModel };
              }
              // Skip decommissioned models quickly (don't waste retries)
              const errStr = fbResult.error || "";
              if (errStr.includes("decommission") || errStr.includes("no longer supported")) {
                console.log(`[AI Fallback] ${fallbackModel} is decommissioned, skipping...`);
                continue;
              }
              console.log(`[AI Fallback] ${fallbackModel} also failed: ${errStr.slice(0, 80)}`);
            }
          }
          return result;
        };

        // Check if the active model actually supports tool calling
        const activeModelCap = getModelCapability(activeModel);
        const modelSupportsTools = activeModelCap?.supportsTools !== false;
        let shouldSendTools = modelSupportsTools && availableTools.length > 0;

        if (!shouldSendTools && availableTools.length > 0) {
          console.log(`[AI Model] ${activeModel} does not support tools — generating without tools`);
        }

        while (round < MAX_TOOL_ROUNDS) {
          round++;

          // Call AI — only send tools if model supports them
          // For Z.ai GLM models: tool_choice "auto" is the ONLY supported value
          const toolChoice = shouldSendTools ? "auto" : undefined;
          const result = await callWithFallback(
            aiMessages,
            activeModel,
            maxTokens,
            shouldSendTools ? availableTools as unknown as NonNullable<Parameters<typeof chatCompletion>[0]["tools"]> : undefined,
            toolChoice,
            `Round ${round}`,
          );

          // If fallback switched model, update activeModel for display
          if ((result as any)._fallbackModel) {
            activeModel = (result as any)._fallbackModel;
            modelAutoRouted = true;
            modelRouteReason = `Original model hit a rate limit or error. Auto-switched to "${getModelCapability(activeModel)?.name || activeModel}" (${getModelCapability(activeModel)?.category})`;
            // Recalculate tool support for the new model (fallback may not support tools)
            const fbCap = getModelCapability(activeModel);
            if (fbCap && fbCap.supportsTools === false) {
              shouldSendTools = false;
              console.log(`[AI Fallback] ${activeModel} does not support tools — continuing without tools`);
            }
          }

          console.log(`[AI Round ${round}] model=${activeModel}${modelAutoSelected ? " (auto-selected for docs)" : ""}${modelAutoRouted ? " (auto-routed)" : ""} command=${command || "none"} has_tools=${!!result.tool_calls} content_len=${result.content?.length || 0} success=${result.success} error=${result.error || "none"}`);

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

          // If the model returned BOTH content and tool calls, capture the content
          // This handles the case where the model starts generating but also wants to call tools
          if (result.content && result.content.length > 100) {
            finalContent = result.content;
            // Don't break — continue executing tool calls to show in UI
            console.log(`[AI Round ${round}] Model returned content alongside tool calls, captured content_len=${result.content.length}`);
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

        // Better fallback: retry without tools (with provider fallback) for commands that produced no content
        if (!finalContent) {
          if (command) {
            // The model got stuck in a tool loop — retry without tools so it just generates text
            console.log(`[AI Fallback] No content after ${round} rounds for ${command}, retrying without tools (with provider fallback)...`);
            try {
              const retryMessages: AiMessage[] = [
                { role: "system", content: systemPrompt },
                ...chatHistory.map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) })),
              ];
              const retryResult = await callWithFallback(retryMessages, activeModel, maxTokens, undefined, undefined, "No-tools retry");
              if ((retryResult as any)._fallbackModel) {
                activeModel = (retryResult as any)._fallbackModel;
                modelAutoRouted = true;
                modelRouteReason = `Auto-switched to "${getModelCapability(activeModel)?.name || activeModel}" (${getModelCapability(activeModel)?.category})`;
              }
              if (retryResult.success && retryResult.content) {
                finalContent = retryResult.content;
                console.log(`[AI Fallback] Retry succeeded, content_len=${retryResult.content.length}`);
              } else {
                console.error(`[AI Fallback] Retry also failed: ${retryResult.error}`);
                finalContent = `I received your \`${command}\` command but all AI models returned an error after trying multiple providers.\n\n**Error:** ${retryResult.error || "All providers failed"}\n\n**Suggestions:**\n- Wait a moment and try again (rate limits reset periodically)\n- Try a simpler command like \`/help\`\n- Check that your AI provider API keys are valid in Vercel settings`;
              }
            } catch (retryErr) {
              console.error("[AI Fallback] Retry error:", retryErr);
              finalContent = `I received your \`${command}\` command but encountered an error. Please try again.`;
            }
          } else {
            finalContent = "I'm here to help! What would you like me to do?";
          }
        }

        aiText = finalContent;
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

    // ===== Auto-save document to ProjectDocument =====
    let documentInfo: { id: string; docType: string; title: string; version: number } | undefined;
    if (!aiError && aiText.length > 500) {
      try {
        let docType: string | undefined;

        // Check if this is a direct doc command
        if (isDocCommand && command && DOC_TYPE_MAP[command]) {
          docType = DOC_TYPE_MAP[command];
        }
        // Or if the AI response matches a document signature (update flow)
        if (!docType) {
          const detected = detectDocTypeFromContent(aiText);
          docType = detected || undefined;
        }

        if (docType) {
          // Extract title from markdown heading
          const title = aiText.split("\n").find(l => l.trim().startsWith("#"))
            ?.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().slice(0, 100)
            || docType.toUpperCase() + " Document";

          // Generate PDF from markdown content
          let pdfBase64 = "";
          try {
            pdfBase64 = await generatePdfBase64(aiText);
          } catch (pdfErr) {
            console.error("[POST /api/ai/chat] PDF generation error (non-fatal):", pdfErr);
          }

          // Check if document already exists for this project+type
          const existing = await client.execute({
            sql: `SELECT id, version FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" = ?`,
            args: [projectId, docType],
          });

          if (existing.rows.length > 0) {
            // Update existing — increment version
            const existingId = existing.rows[0].id as string;
            const newVersion = Number(existing.rows[0].version) + 1;
            await client.execute({
              sql: `UPDATE "ProjectDocument" SET title = ?, content = ?, "pdfData" = ?, version = ?, "updatedAt" = datetime('now') WHERE id = ?`,
              args: [title, aiText, pdfBase64, newVersion, existingId],
            });
            documentInfo = { id: existingId, docType, title, version: newVersion };
            console.log("[POST /api/ai/chat] Auto-saved document update:", docType, "v" + newVersion);
          } else {
            // Create new
            const newDocId = crypto.randomUUID();
            await client.execute({
              sql: `INSERT INTO "ProjectDocument" (id, "projectId", "docType", title, content, "pdfData", version, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
              args: [newDocId, projectId, docType, title, aiText, pdfBase64],
            });
            documentInfo = { id: newDocId, docType, title, version: 1 };
            console.log("[POST /api/ai/chat] Auto-saved new document:", docType, "v1");
          }
        }
      } catch (docErr) {
        console.error("[POST /api/ai/chat] Auto-save document error (non-fatal):", docErr);
      }
    }

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

    // ===== Extract TRD theme colors (runs after doc save if TRD was generated) =====
    if ((command === "/trd" || (documentInfo && documentInfo.docType === "trd")) && aiText && aiText.length > 500) {
      try {
        const settingsKey = "PROJECT_THEME:" + projectId;
        const existingTheme = await client.execute({
          sql: `SELECT key FROM "Settings" WHERE key = ?`,
          args: [settingsKey],
        });
        if (existingTheme.rows.length === 0) {
          const colorMatches = aiText.match(/#[0-9A-Fa-f]{6}/g) || [];
          if (colorMatches.length > 0) {
            const themeColors = { colors: [...new Set(colorMatches)] };
            await client.execute({
              sql: `INSERT OR REPLACE INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
              args: [settingsKey, JSON.stringify(themeColors)],
            });
            console.log("[Chat] Extracted theme colors from TRD:", themeColors.colors.length);
          }
        }
      } catch (themeErr) {
        console.error("[Chat] Theme extraction error (non-fatal):", themeErr);
      }
    }

    // ===== Auto-push document to GitHub (fire-and-forget, non-blocking) =====
    if (documentInfo && !aiError) {
      // Fire-and-forget: push to GitHub in background without blocking the response
      (async () => {
        try {
          const repoResult = await client.execute({
            sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
            args: [],
          });
          const patResult = await client.execute({
            sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_PAT'`,
            args: [],
          });

          if (repoResult.rows.length === 0 || patResult.rows.length === 0) {
            console.log("[Chat] No GitHub config, skipping auto-push for", documentInfo.docType);
            return;
          }

          const repoUrl = repoResult.rows[0].value as string;
          let token: string;
          try {
            token = decrypt(patResult.rows[0].value as string);
          } catch {
            token = patResult.rows[0].value as string; // Legacy unencrypted
          }

          const githubConfig = { repoUrl, token };
          const docLabel = documentInfo.docType.toUpperCase();
          const commitMsg = `docs: update ${docLabel} document (v${documentInfo.version})`;

          // Push markdown file
          const mdPath = "docs/pre-coding/" + documentInfo.docType + ".md";
          await pushFile(githubConfig, mdPath, aiText, commitMsg);
          console.log("[Chat] GitHub push: markdown", mdPath);

          // Push PDF if available
          if (documentInfo) {
            const pdfResult = await client.execute({
              sql: `SELECT "pdfData" FROM "ProjectDocument" WHERE id = ? AND "pdfData" IS NOT NULL AND "pdfData" != ''`,
              args: [documentInfo.id],
            });
            if (pdfResult.rows.length > 0 && pdfResult.rows[0].pdfData) {
              const pdfPath = "docs/pre-coding/" + documentInfo.docType + ".pdf";
              await pushBinaryFile(githubConfig, pdfPath, pdfResult.rows[0].pdfData as string, commitMsg);
              console.log("[Chat] GitHub push: PDF", pdfPath);
            }
          }

          console.log("[Chat] GitHub auto-push complete for", documentInfo.docType, "v" + documentInfo.version);
        } catch (ghErr) {
          console.error("[Chat] GitHub auto-push failed (non-fatal):", ghErr);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      data: {
        userMessage: { id: userMsgId, role: "user", content, projectId },
        aiMessage: { id: aiMsgId, role: "assistant", content: aiText, projectId },
        error: aiError || undefined,
        toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
        model: activeModel,
        modelAutoSelected: modelAutoSelected || undefined,
        modelAutoRouted: modelAutoRouted || undefined,
        modelRouteReason: modelRouteReason || undefined,
        documentInfo: documentInfo || undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/chat] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
