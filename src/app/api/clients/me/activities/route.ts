import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient } from '@/lib/api-auth';

// GET /api/clients/me/activities — Get activities visible to client (their projects)
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

    // Get project IDs linked to this client
    const projectsResult = await client.execute({
      sql: 'SELECT id FROM "Project" WHERE "clientId" = ?',
      args: [clientId],
    });

    const projectIds = projectsResult.rows.map(r => r.id as string);

    if (projectIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { activities: [], notifications: [] },
      });
    }

    // Build OR clause for project IDs
    const orConditions = projectIds.map(() => '"ActivityLog"."entityId" = ?').join(' OR ');
    const orArgs = [...projectIds];

    // Get activities related to client's projects (visible ones)
    const activitiesResult = await client.execute({
      sql: `SELECT "ActivityLog".*, "User"."name" as "userName"
            FROM "ActivityLog"
            LEFT JOIN "User" ON "ActivityLog"."userId" = "User"."id"
            WHERE ("ActivityLog"."entity" = 'project' AND (${orConditions}))
            ORDER BY "ActivityLog"."timestamp" DESC
            LIMIT 50`,
      args: orArgs,
    });

    // Get client notifications
    const notificationsResult = await client.execute({
      sql: `SELECT cn.*, p.name as "projectName", u.name as "sentByName"
            FROM "ClientNotification" cn
            LEFT JOIN "Project" p ON cn."projectId" = p.id
            LEFT JOIN "User" u ON cn."sentBy" = u.id
            WHERE cn."clientId" = ?
            ORDER BY cn."createdAt" DESC
            LIMIT 50`,
      args: [clientId],
    });

    const activities = activitiesResult.rows.map((row) => ({
      id: row.id,
      action: row.action,
      details: row.details,
      entity: row.entity,
      entityId: row.entityId,
      timestamp: row.timestamp,
      userName: row.userName,
    }));

    const notifications = notificationsResult.rows.map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      projectName: row.projectName,
      sentByName: row.sentByName,
      createdAt: row.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        activities,
        notifications,
      },
    });
  } catch (error) {
    console.error('[GET /api/clients/me/activities] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
