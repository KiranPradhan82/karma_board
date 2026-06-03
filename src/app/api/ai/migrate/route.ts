import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{}>;
}

// POST /api/ai/migrate — Clean and re-seed AI protocol tables (SUPERADMIN only)
export async function POST(request: NextRequest) {
  const results: { action: string; status: string; details?: string }[] = [];

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

    // 1. Drop old/legacy tables if they exist (from previous schema versions)
    const legacyTables = ["AiSeedProtocol", "AiSeedProtocolStep"];
    for (const table of legacyTables) {
      try {
        await client.execute({ sql: `DROP TABLE IF EXISTS "${table}"`, args: [] });
        results.push({ action: `DROP ${table}`, status: "dropped" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: `DROP ${table}`, status: "skipped (error)", details: msg });
      }
    }

    // 2. Recreate AiProtocol table (drop + create to ensure latest schema)
    try {
      await client.execute({ sql: `DROP TABLE IF EXISTS "AiProtocolStep"`, args: [] });
      results.push({ action: "DROP AiProtocolStep (recreate)", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "DROP AiProtocolStep", status: "error", details: msg });
    }

    try {
      await client.execute({ sql: `DROP TABLE IF EXISTS "AiProtocol"`, args: [] });
      results.push({ action: "DROP AiProtocol (recreate)", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "DROP AiProtocol", status: "error", details: msg });
    }

    // 3. Create AiProtocol table fresh
    try {
      await client.execute({
        sql: `CREATE TABLE "AiProtocol" (
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

    // 4. Create AiProtocolStep table fresh
    try {
      await client.execute({
        sql: `CREATE TABLE "AiProtocolStep" (
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

    // 5. Create index
    try {
      await client.execute({
        sql: `CREATE INDEX IF NOT EXISTS "AiProtocolStep_protocolId_idx" ON "AiProtocolStep"("protocolId")`,
        args: [],
      });
      results.push({ action: "CREATE INDEX", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "CREATE INDEX", status: "error", details: msg });
    }

    // 6. Insert the default "Pre-coding Documentation" protocol with 11 steps
    const protocolId = crypto.randomUUID();

    try {
      await client.execute({
        sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 1, NULL, datetime('now'), datetime('now'))`,
        args: [
          protocolId,
          "Pre-coding Documentation",
          "Complete pre-coding documentation generation protocol with 5-phase approach.",
          1,
          null,
        ],
      });
      results.push({ action: "INSERT protocol", status: "created" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "INSERT protocol", status: "error", details: msg });
    }

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
      try {
        await client.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [crypto.randomUUID(), protocolId, step.title, step.description, step.commandTag, step.stepOrder],
        });
        stepsInserted++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: `INSERT step ${step.stepOrder}`, status: "error", details: msg });
      }
    }
    results.push({ action: "INSERT steps", status: "ok", details: `${stepsInserted}/11 steps inserted` });

    // 8. Verify
    try {
      const verifyResult = await client.execute({
        sql: `SELECT COUNT(*) as count FROM "AiProtocolStep" WHERE "protocolId" = ?`,
        args: [protocolId],
      });
      const stepCount = Number(verifyResult.rows[0].count);
      results.push({ action: "VERIFY", status: stepCount === 11 ? "ok" : "warning", details: `${stepCount} steps in database` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "VERIFY", status: "error", details: msg });
    }

    // Log activity (non-blocking — don't fail the whole migration if logging fails)
    try {
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
      results.push({ action: "LOG", status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ action: "LOG", status: "skipped", details: msg });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "AI protocol tables cleaned and re-seeded successfully",
        results,
        protocolId,
        totalSteps: stepsInserted,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/migrate] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error",
      debug: error instanceof Error ? error.message : String(error),
      results,
    }, { status: 500 });
  }
}
