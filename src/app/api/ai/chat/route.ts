import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, logActivity, getClientIp } from "@/lib/api-auth";
import { buildSystemPrompt } from "@/lib/ai-prompts";
import ZAI from "z-ai-web-dev-sdk";

interface RouteContext {
  params: Promise<{}>;
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

    const client = getTursoClient();
    const ip = getClientIp(request);

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
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      projectName: project?.name as string | undefined,
      projectDescription: project?.description as string | undefined,
      projectClient: project?.clientName as string | undefined,
      protocolSteps: protocolSteps.length > 0 ? protocolSteps : undefined,
      command,
    });

    // Build messages array for AI
    const aiMessages: { role: string; content: string | unknown[] }[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of chatHistory) {
      aiMessages.push({ role: msg.role, content: msg.content });
    }

    try {
      // Initialize ZAI SDK
      const zai = await ZAI.create();

      let aiResponse: unknown;

      // If image file attached, use vision API
      if (fileData && fileType && fileType.startsWith("image/")) {
        aiResponse = await zai.chat.completions.createVision({
          model: "glm-4v-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: content },
                {
                  type: "image_url",
                  image_url: { url: `data:${fileType};base64,${fileData}` },
                },
              ],
            },
          ],
        });
      } else {
        aiResponse = await zai.chat.completions.create({
          model: "glm-4-flash",
          messages: aiMessages as { role: string; content: string }[],
        });
      }

      // Extract AI response text
      const responseObj = aiResponse as { choices?: { message?: { content?: string } }[] };
      const aiText =
        responseObj?.choices?.[0]?.message?.content ||
        "I apologize, but I was unable to generate a response. Please try again.";

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
        },
      });
    } catch (aiError) {
      console.error("[POST /api/ai/chat] AI SDK Error:", aiError);

      const errorMsg =
        "I encountered an issue connecting to the AI service. Please try again in a moment.";

      // Save error as AI response
      const aiMsgId = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO "AiChat" (id, "userId", "projectId", "role", "content", "timestamp")
              VALUES (?, ?, ?, 'assistant', ?, datetime('now'))`,
        args: [aiMsgId, user.id, projectId, errorMsg],
      });

      return NextResponse.json({
        success: true,
        data: {
          userMessage: { id: userMsgId, role: "user", content, projectId },
          aiMessage: { id: aiMsgId, role: "assistant", content: errorMsg, projectId },
          error: true,
        },
      });
    }
  } catch (error) {
    console.error("[POST /api/ai/chat] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
