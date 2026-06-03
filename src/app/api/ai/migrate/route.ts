import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{}>;
}

// POST /api/ai/migrate — One-time migration to create AiProtocol tables (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Create AiProtocol table
    try {
      await client.execute({
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error creating AiProtocol table:", msg);
    }

    // Create AiProtocolStep table
    try {
      await client.execute({
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error creating AiProtocolStep table:", msg);
    }

    // Create index
    try {
      await client.execute({
        sql: `CREATE INDEX IF NOT EXISTS "AiProtocolStep_protocolId_idx" ON "AiProtocolStep"("protocolId")`,
        args: [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error creating index:", msg);
    }

    // Seed the default "Pre-coding Documentation" protocol if not exists
    const existing = await client.execute({
      sql: `SELECT id FROM "AiProtocol" WHERE name = ?`,
      args: ["Pre-coding Documentation"],
    });

    if (existing.rows.length === 0) {
      const protocolId = crypto.randomUUID();

      await client.execute({
        sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 1, NULL, datetime('now'), datetime('now'))`,
        args: [
          protocolId,
          "Pre-coding Documentation",
          "Complete pre-coding documentation generation protocol. Generates all essential project documents before development begins.",
          1,
          null,
        ],
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
        const stepId = crypto.randomUUID();
        await client.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [stepId, protocolId, step.title, step.description, step.commandTag, step.stepOrder],
        });
      }
    }

    // Log activity
    const { logActivity } = await import("@/lib/api-auth");
    await logActivity({
      userId: user.id,
      action: "AI_MIGRATION",
      details: "Ran AI tables migration and seed",
      entity: "system",
      entityId: "ai_migrate",
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: { message: "AI protocol tables created and seeded successfully" },
    });
  } catch (error) {
    console.error("[POST /api/ai/migrate] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
