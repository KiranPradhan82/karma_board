import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{}>;
}

// POST /api/ai/migrate — Clean and re-seed AI protocol tables (SUPERADMIN only)
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

    const results: { action: string; status: string; details?: string }[] = [];

    // 1. Drop old/legacy tables if they exist (from previous schema versions)
    const legacyTables = ["AiSeedProtocol", "AiSeedProtocolStep"];
    for (const table of legacyTables) {
      try {
        await client.execute({ sql: `DROP TABLE IF EXISTS "${table}"`, args: [] });
        results.push({ action: `DROP ${table}`, status: "dropped" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: `DROP ${table}`, status: "error", details: msg });
      }
    }

    // 2. Create AiProtocol table
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
      results.push({ action: "CREATE AiProtocol", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "CREATE AiProtocol", status: "error", details: msg });
    }

    // 3. Create AiProtocolStep table
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
      results.push({ action: "CREATE AiProtocolStep", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "CREATE AiProtocolStep", status: "error", details: msg });
    }

    // 4. Create index
    try {
      await client.execute({
        sql: `CREATE INDEX IF NOT EXISTS "AiProtocolStep_protocolId_idx" ON "AiProtocolStep"("protocolId")`,
        args: [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error creating index:", msg);
    }

    // 5. Get or create the "Pre-coding Documentation" protocol
    const existing = await client.execute({
      sql: `SELECT id FROM "AiProtocol" WHERE name = ?`,
      args: ["Pre-coding Documentation"],
    });

    const protocolId = existing.rows.length > 0
      ? (existing.rows[0].id as string)
      : crypto.randomUUID();

    if (existing.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 1, NULL, datetime('now'), datetime('now'))`,
        args: [
          protocolId,
          "Pre-coding Documentation",
          "Complete pre-coding documentation generation protocol with phased approach.",
          1,
          null,
        ],
      });
      results.push({ action: "INSERT protocol", status: "created" });
    } else {
      results.push({ action: "Protocol exists", status: "reusing", details: protocolId });
    }

    // 6. Delete ALL existing steps for this protocol (clean slate)
    const deleteResult = await client.execute({
      sql: `DELETE FROM "AiProtocolStep" WHERE "protocolId" = ?`,
      args: [protocolId],
    });
    results.push({ action: "DELETE old steps", status: "ok", details: `${deleteResult.rowsAffected || "?"} rows deleted` });

    // 7. Insert the latest 11-step phased protocol
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

    let stepsInserted = 0;
    for (const step of defaultSteps) {
      await client.execute({
        sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [crypto.randomUUID(), protocolId, step.title, step.description, step.commandTag, step.stepOrder],
      });
      stepsInserted++;
    }
    results.push({ action: "INSERT new steps", status: "ok", details: `${stepsInserted} steps inserted` });

    // 8. Verify
    const verifyResult = await client.execute({
      sql: `SELECT COUNT(*) as count FROM "AiProtocolStep" WHERE "protocolId" = ?`,
      args: [protocolId],
    });
    const stepCount = Number(verifyResult.rows[0].count);
    results.push({ action: "VERIFY", status: "ok", details: `${stepCount} steps in database` });

    // Log activity
    const { logActivity } = await import("@/lib/api-auth");
    await logActivity({
      userId: user.id,
      action: "AI_MIGRATION",
      details: `Clean and re-seed AI protocol tables (${stepsInserted} steps)`,
      entity: "system",
      entityId: "ai_migrate",
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "AI protocol tables cleaned and re-seeded successfully",
        results,
        protocolId,
        totalSteps: stepCount,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/migrate] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
