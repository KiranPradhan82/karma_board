import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient } from '@/lib/api-auth';

// GET /api/clients/me/projects — List projects linked to this client with todo summary
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id || token.accountType !== 'client') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const clientId = token.id as string;
    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT p.id, p.name, p.description, p.status, p.priority, p.color, p.deadline,
                   COALESCE(tc.cnt, 0) as "totalTodos",
                   COALESCE(td.cnt, 0) as "doneTodos"
            FROM "Project" p
            LEFT JOIN (
              SELECT "projectId", COUNT(*) as cnt FROM "ProjectTodo" GROUP BY "projectId"
            ) tc ON tc."projectId" = p.id
            LEFT JOIN (
              SELECT "projectId", COUNT(*) as cnt FROM "ProjectTodo" WHERE status = 'DONE' GROUP BY "projectId"
            ) td ON td."projectId" = p.id
            WHERE p."clientId" = ?
            ORDER BY p.status = 'ACTIVE' DESC, p."updatedAt" DESC`,
      args: [clientId],
    });

    const projects = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      color: row.color,
      deadline: row.deadline,
      totalTodos: Number(row.totalTodos),
      doneTodos: Number(row.doneTodos),
      completionPercent: Number(row.totalTodos) > 0
        ? Math.round((Number(row.doneTodos) / Number(row.totalTodos)) * 100)
        : 0,
    }));

    return NextResponse.json({ success: true, data: { projects } });
  } catch (error) {
    console.error('[GET /api/clients/me/projects] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `Internal server error: ${msg}` }, { status: 500 });
  }
}