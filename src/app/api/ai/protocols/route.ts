import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, logActivity, getClientIp } from "@/lib/api-auth";

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

// GET /api/ai/protocols — List protocols (global + project-specific)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || "";

    const client = getTursoClient();

    // Auto-migrate AI tables if they don't exist
    await ensureAiTables(client);

    let protocolsResult;

    if (projectId) {
      protocolsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocol" WHERE "isGlobal" = 1 OR "projectId" = ? ORDER BY "isGlobal" DESC, "createdAt" ASC`,
        args: [projectId],
      });
    } else {
      protocolsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocol" ORDER BY "isGlobal" DESC, "createdAt" ASC`,
        args: [],
      });
    }

    const protocols = [];

    for (const row of protocolsResult.rows) {
      const stepsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocolStep" WHERE "protocolId" = ? ORDER BY "stepOrder" ASC`,
        args: [row.id],
      });

      protocols.push({
        id: row.id,
        name: row.name,
        description: row.description,
        isGlobal: Boolean(row.isGlobal),
        projectId: row.projectId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        steps: stepsResult.rows.map((s) => ({
          id: s.id,
          protocolId: s.protocolId,
          title: s.title,
          description: s.description,
          commandTag: s.commandTag,
          stepOrder: Number(s.stepOrder),
          createdAt: s.createdAt,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      data: { protocols },
    });
  } catch (error) {
    console.error("[GET /api/ai/protocols] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/ai/protocols — Create protocol (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { name, description, isGlobal, projectId, steps } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);
    const protocolId = crypto.randomUUID();

    await client.execute({
      sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        protocolId,
        name,
        description || null,
        isGlobal ? 1 : 0,
        projectId || null,
      ],
    });

    // Create steps
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = crypto.randomUUID();
        await client.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [
            stepId,
            protocolId,
            step.title,
            step.description || null,
            step.commandTag || null,
            step.stepOrder !== undefined ? step.stepOrder : i + 1,
          ],
        });
      }
    }

    await logActivity({
      userId: user.id,
      action: "CREATE_PROTOCOL",
      details: `Created protocol: ${name}`,
      entity: "ai_protocol",
      entityId: protocolId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          protocol: {
            id: protocolId,
            name,
            description: description || null,
            isGlobal: Boolean(isGlobal),
            projectId: projectId || null,
            steps: steps || [],
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/ai/protocols] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
