import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient } from '@/lib/api-auth';

// GET /api/dashboard/stats — Dashboard overview statistics
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const client = getTursoClient();

    // Total Projects (respect role-based visibility)
    const projectConditions: string[] = [];
    const projectArgs: unknown[] = [];
    if (user.role !== 'SUPERADMIN') {
      projectConditions.push(`p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)`);
      projectArgs.push(user.id);
    }
    const projectWhere = projectConditions.length > 0 ? `WHERE ${projectConditions.join(' AND ')}` : '';
    const projectResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "Project" p ${projectWhere}`,
      args: projectArgs,
    });
    const totalProjects = Number(projectResult.rows[0].total);

    // Active Members (non-deleted, active users)
    const membersResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "User" WHERE "deletedAt" IS NULL AND "isActive" = 1`,
      args: [],
    });
    const activeMembers = Number(membersResult.rows[0].total);

    // Hours Today (sum of durations for today's completed time logs)
    const today = new Date().toISOString().split('T')[0];
    const hoursResult = await client.execute({
      sql: `SELECT COALESCE(SUM(duration), 0) as totalSeconds FROM "TimeLog" WHERE date("clockIn") = ? AND "clockOut" IS NOT NULL`,
      args: [today],
    });
    const totalSeconds = Number(hoursResult.rows[0].totalSeconds) || 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    // Active Sessions (time logs without clockOut, i.e. currently tracking)
    const sessionsResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "TimeLog" WHERE "clockOut" IS NULL`,
      args: [],
    });
    const activeSessions = Number(sessionsResult.rows[0].total);

    // Recent Activity (last 20 activity logs with user info)
    const activityResult = await client.execute({
      sql: `SELECT a.id, a.action, a.details, a.entity, a."entityId", a.timestamp, u.name as userName, u.avatar as userAvatar
            FROM "ActivityLog" a
            LEFT JOIN "User" u ON a."userId" = u.id
            ORDER BY a.timestamp DESC
            LIMIT 20`,
      args: [],
    });
    const recentActivity = activityResult.rows.map((row) => ({
      id: row.id,
      action: row.action,
      details: row.details,
      entity: row.entity,
      entityId: row.entityId,
      timestamp: row.timestamp,
      userName: row.userName,
      userAvatar: row.userAvatar,
    }));

    // Project status breakdown
    const statusResult = await client.execute({
      sql: `SELECT status, COUNT(*) as count FROM "Project" p ${projectWhere} GROUP BY status`,
      args: projectArgs,
    });
    const projectStatusBreakdown: Record<string, number> = {};
    for (const row of statusResult.rows) {
      projectStatusBreakdown[row.status as string] = Number(row.count);
    }

    return NextResponse.json({
      success: true,
      data: {
        totalProjects,
        activeMembers,
        hoursToday: { hours, minutes, formatted: `${hours}h ${minutes}m` },
        activeSessions,
        recentActivity,
        projectStatusBreakdown,
      },
    });
  } catch (error) {
    console.error('[GET /api/dashboard/stats] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
