import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient } from '@/lib/api-auth';

// GET /api/clients/me/projects/[id]/todos — Client views project todos (read-only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id || token.accountType !== 'client') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const clientId = token.id as string;
    const { id: projectId } = await params;
    const client = getTursoClient();

    // Verify this project belongs to this client
    const projectCheck = await client.execute({
      sql: `SELECT id, name FROM "Project" WHERE id = ? AND "clientId" = ?`,
      args: [projectId, clientId],
    });

    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    // Get all todos with assignee info
    const todosResult = await client.execute({
      sql: `SELECT t.*, au.name as "assigneeName", au.email as "assigneeEmail",
                   au."jobTitle" as "assigneeJobTitle"
            FROM "ProjectTodo" t
            LEFT JOIN "User" au ON t."assigneeId" = au.id
            WHERE t."projectId" = ?
            ORDER BY
              CASE t.status
                WHEN 'PENDING_REVIEW' THEN 0
                WHEN 'IN_PROGRESS' THEN 1
                WHEN 'PENDING' THEN 2
                WHEN 'DONE' THEN 3
                WHEN 'COMPLETED' THEN 3
              END,
              CASE t.priority
                WHEN 'HIGH' THEN 0
                WHEN 'MEDIUM' THEN 1
                WHEN 'LOW' THEN 2
              END,
              t."sortOrder" ASC,
              t."createdAt" ASC`,
      args: [projectId],
    });

    // Get summary counts
    const summaryResult = await client.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status IN ('DONE', 'COMPLETED') THEN 1 ELSE 0 END) as done,
              SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress,
              SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) as pendingReview,
              SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
            FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });

    const summary = summaryResult.rows[0];
    const totalTodos = Number(summary.total);
    const doneTodos = Number(summary.done);
    const inProgressTodos = Number(summary.inProgress);
    const pendingTodos = Number(summary.pending);

    const todos = todosResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      assigneeName: row.assigneeName,
      assigneeEmail: row.assigneeEmail,
      assigneeJobTitle: row.assigneeJobTitle,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    // Get last updated timestamp for polling detection
    const lastUpdate = await client.execute({
      sql: `SELECT MAX("updatedAt") as "lastUpdate" FROM "ProjectTodo" WHERE "projectId" = ?`,
      args: [projectId],
    });

    return NextResponse.json({
      success: true,
      data: {
        projectName: projectCheck.rows[0].name,
        todos,
        summary: {
          total: totalTodos,
          done: doneTodos,
          inProgress: inProgressTodos,
          pendingReview: Number(summary.pendingReview),
          pending: pendingTodos,
          completionPercent: totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0,
        },
        lastUpdate: lastUpdate.rows[0]?.lastUpdate || null,
      },
    });
  } catch (error) {
    console.error('[GET /api/clients/me/projects/[id]/todos] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `Internal server error: ${msg}` }, { status: 500 });
  }
}