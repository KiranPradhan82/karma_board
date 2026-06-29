import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, getClientIp, logActivity } from '@/lib/api-auth';
import { notifyClient } from '@/lib/notify-client';

// GET /api/projects/[id]/todos — List all todos for a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const client = getTursoClient();

    // Ensure ProjectTodo table exists
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS "ProjectTodo" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "assigneeId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "dueDate" DATETIME, "sortOrder" INTEGER NOT NULL DEFAULT 0, "reviewedBy" TEXT, "reviewedAt" DATETIME, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`, args: [] });

    // Verify project exists and user has access (member or admin/superadmin)
    const projectCheck = await client.execute({
      sql: `SELECT p.id, p.name FROM "Project" p
            WHERE p.id = ?
            AND (p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)
                 OR ? IN ('SUPERADMIN', 'ADMIN'))`,
      args: [projectId, user.id, user.role],
    });

    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const assigneeFilter = searchParams.get('assigneeId');

    let whereClause = 'WHERE t."projectId" = ?';
    const sqlArgs: unknown[] = [projectId];

    if (statusFilter && statusFilter !== 'ALL') {
      whereClause += ' AND t.status = ?';
      sqlArgs.push(statusFilter);
    }

    if (assigneeFilter) {
      if (assigneeFilter === 'unassigned') {
        whereClause += ' AND t."assigneeId" IS NULL';
      } else {
        whereClause += ' AND t."assigneeId" = ?';
        sqlArgs.push(assigneeFilter);
      }
    }

    const todosResult = await client.execute({
      sql: `SELECT t.*, au.name as "assigneeName", au.email as "assigneeEmail", au.avatar as "assigneeAvatar",
                   cu.name as "createdByName"
            FROM "ProjectTodo" t
            LEFT JOIN "User" au ON t."assigneeId" = au.id
            LEFT JOIN "User" cu ON t."createdBy" = cu.id
            ${whereClause}
            ORDER BY t."sortOrder" ASC, t."createdAt" ASC`,
      args: sqlArgs,
    });

    // Get summary counts (without filters)
    const summaryResult = await client.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as done,
              SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) as pendingReview,
              SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress,
              SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
            FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });

    const summary = summaryResult.rows[0];
    const totalTodos = Number(summary.total);
    const doneTodos = Number(summary.done);
    const pendingReviewTodos = Number(summary.pendingReview);
    const inProgressTodos = Number(summary.inProgress);
    const pendingTodos = Number(summary.pending);

    const todos = todosResult.rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      assigneeId: row.assigneeId,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      sortOrder: Number(row.sortOrder),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assigneeName: row.assigneeName,
      assigneeEmail: row.assigneeEmail,
      assigneeAvatar: row.assigneeAvatar,
      createdByName: row.createdByName,
    }));

    return NextResponse.json({
      success: true,
      data: {
        todos,
        summary: {
          total: totalTodos,
          done: doneTodos,
          inProgress: inProgressTodos,
          pendingReview: pendingReviewTodos,
          pending: pendingTodos,
          completionPercent: totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/todos] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[id]/todos — Create a new todo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Ensure ProjectTodo table exists
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS "ProjectTodo" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "assigneeId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "dueDate" DATETIME, "sortOrder" INTEGER NOT NULL DEFAULT 0, "reviewedBy" TEXT, "reviewedAt" DATETIME, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`, args: [] });

    // Verify project access (member or admin/superadmin)
    const projectCheck = await client.execute({
      sql: `SELECT p.id, p.name FROM "Project" p
            WHERE p.id = ?
            AND (p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)
                 OR ? IN ('SUPERADMIN', 'ADMIN'))`,
      args: [projectId, user.id, user.role],
    });

    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, assigneeId, priority, dueDate } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    // Validate priority
    const validPriorities = ['HIGH', 'MEDIUM', 'LOW'];
    const todoPriority = validPriorities.includes(priority) ? priority : 'MEDIUM';

    // Validate assignee (if provided, must be a project member)
    if (assigneeId) {
      const memberCheck = await client.execute({
        sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
        args: [projectId, assigneeId],
      });
      if (memberCheck.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Assignee must be a project member' }, { status: 400 });
      }
    }

    // Get next sortOrder
    const maxOrder = await client.execute({
      sql: `SELECT COALESCE(MAX("sortOrder"), -1) as maxOrder FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });
    const nextSortOrder = Number(maxOrder.rows[0].maxOrder) + 1;

    const todoId = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO "ProjectTodo" (id, "projectId", "assigneeId", title, description, status, priority, "dueDate", "sortOrder", "createdBy", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        todoId,
        projectId,
        assigneeId || null,
        title.trim(),
        description?.trim() || null,
        todoPriority,
        dueDate || null,
        nextSortOrder,
        user.id,
      ],
    });

    // Log activity
    try {
      await logActivity({
        userId: user.id,
        action: 'CREATE_TODO',
        details: `Created todo "${title.trim()}"${assigneeId ? ` assigned to ${assigneeId}` : ''}`,
        entity: 'project',
        entityId: projectId,
        ipAddress: ip,
        tursoClient: client,
      });
    } catch {
      // Non-critical
    }

    // Notify client if project has a linked client
    notifyClient({
      projectId,
      type: 'UPDATE',
      message: `New task added: ${title.trim()}`,
      sentBy: user.id,
    });

    return NextResponse.json({
      success: true,
      data: { id: todoId },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/todos] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}