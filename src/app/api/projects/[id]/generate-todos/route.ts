import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DOC_LABELS: Record<string, string> = {
  prd: "Product Requirements",
  trd: "Technical Requirements",
  flow: "Application Flow",
  ux: "UI/UX Design",
  schema: "Database Schema",
  plan: "Implementation Plan",
};

// POST /api/projects/[id]/generate-todos — Retroactively generate todos from all existing pre-coding docs
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id: projectId } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Ensure ProjectTodo table exists (auto-create if missing)
    await client.execute({
      sql: `CREATE TABLE IF NOT EXISTS "ProjectTodo" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "assigneeId" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
        "dueDate" DATETIME,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "reviewedBy" TEXT,
        "reviewedAt" DATETIME,
        "createdBy" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )`,
      args: [],
    });
    // Ensure indexes exist
    await client.execute({ sql: `CREATE INDEX IF NOT EXISTS "ProjectTodo_projectId_sortOrder_idx" ON "ProjectTodo" ("projectId", "sortOrder")`, args: [] });
    await client.execute({ sql: `CREATE INDEX IF NOT EXISTS "ProjectTodo_assigneeId_idx" ON "ProjectTodo" ("assigneeId")`, args: [] });
    await client.execute({ sql: `CREATE INDEX IF NOT EXISTS "ProjectTodo_projectId_status_idx" ON "ProjectTodo" ("projectId", "status")`, args: [] });

    // Fetch all pre-coding documents for this project
    const docsResult = await client.execute({
      sql: `SELECT id, "docType", title, content FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" IN ('prd', 'trd', 'flow', 'ux', 'schema', 'plan') ORDER BY "docType"`,
      args: [projectId],
    });

    if (docsResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "No pre-coding documents found for this project" }, { status: 404 });
    }

    // Get existing todos for deduplication
    const existingTodos = await client.execute({
      sql: `SELECT title FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });
    const existingTitles = new Set(existingTodos.rows.map((r) => (r.title as string).toLowerCase()));

    // Get current max sortOrder
    const maxOrder = await client.execute({
      sql: `SELECT COALESCE(MAX("sortOrder"), -1) as maxOrder FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });
    let sortOrder = Number(maxOrder.rows[0].maxOrder) + 1;

    let totalGenerated = 0;
    const perDocCounts: Record<string, number> = {};

    for (const row of docsResult.rows) {
      const docType = row.docType as string;
      const content = row.content as string;
      if (!content || content.length < 500) {
        perDocCounts[docType] = 0;
        continue;
      }

      const docLabel = DOC_LABELS[docType] || docType.toUpperCase();
      const tasks: { title: string; description: string; priority: string }[] = [];
      const lines = content.split("\n");
      let currentSection = "";
      let currentPhase = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.match(/^#{1,3}\s/)) {
          currentSection = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
          if (/phase/i.test(currentSection)) {
            currentPhase = currentSection;
          }
          continue;
        }

        const taskMatch = line.match(/^[-*]\s+\[?\s*\]?\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
        if (taskMatch) {
          let taskText = taskMatch[1].trim();
          if (taskText.length < 5) continue;
          if (taskText.match(/^\*\*[^*]+\*\*$/) && taskText.length < 80) continue;

          let priority = "MEDIUM";
          if (/\b(critical|urgent|high.?priority|must.?have|blocker|p0)\b/i.test(taskText) || /\b(critical|urgent|high.?priority|must.?have|blocker|p0)\b/i.test(currentSection)) {
            priority = "HIGH";
          } else if (/\b(low.?priority|nice.?to.?have|optional|future|p[2-3])\b/i.test(taskText) || /\b(low.?priority|nice.?to.?have|optional|future|p[2-3])\b/i.test(currentSection)) {
            priority = "LOW";
          }

          let description = `Source: ${docLabel}`;
          if (currentPhase) description += `\nPhase: ${currentPhase}`;
          if (currentSection && currentSection !== currentPhase) description += `\nSection: ${currentSection}`;

          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.match(/^[-*#]/) && !nextLine.match(/^\d+\./)) {
              description += `\n${nextLine}`;
              break;
            }
          }

          tasks.push({ title: taskText, description: description.trim(), priority });
        }
      }

      // Filter out duplicates
      const newTasks = tasks.filter((t) => !existingTitles.has(t.title.toLowerCase()));

      // Insert and track
      for (const task of newTasks) {
        const id = crypto.randomUUID();
        await client.execute({
          sql: `INSERT INTO "ProjectTodo" (id, "projectId", title, description, status, priority, "sortOrder", "createdBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [id, projectId, task.title, task.description || null, task.priority, sortOrder++, user.id],
        });
        existingTitles.add(task.title.toLowerCase()); // prevent cross-doc duplicates
        totalGenerated++;
      }

      perDocCounts[docType] = newTasks.length;
    }

    // Audit log (non-fatal)
    logActivity({
      userId: user.id,
      action: "GENERATE_TODOS_FROM_DOCS",
      details: `Generated ${totalGenerated} tasks from ${docsResult.rows.length} documents`,
      entity: "project_todo",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        totalGenerated,
        documentsProcessed: docsResult.rows.length,
        perDoc: perDocCounts,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[POST /api/projects/[id]/generate-todos] Error:", error);
    return NextResponse.json({ success: false, error: `Server error: ${message}` }, { status: 500 });
  }
}
