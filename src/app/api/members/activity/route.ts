import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, requireRole } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole('SUPERADMIN');
    const denied = roleCheck(user);
    if (denied) return denied;

    const client = getTursoClient();

    // Get all users with their last login and activity, plus session info
    const usersResult = await client.execute({
      sql: `SELECT
        u.id, u.name, u.email, u.role, u.status, u.avatar, u."isActive",
        u."lastLoginAt", u."lastActivityAt",
        s."lastSeen" as sessionLastSeen
      FROM "User" u
      LEFT JOIN "UserSession" s ON u.id = s."userId"
      WHERE u."deletedAt" IS NULL
      ORDER BY s."lastSeen" DESC NULLS LAST, u.name ASC`,
      args: [],
    });

    const users = usersResult.rows.map(row => {
      const sessionLastSeen = row.sessionLastSeen as string | null;
      const lastSeenDate = sessionLastSeen ? new Date(sessionLastSeen) : null;
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const isOnline = lastSeenDate !== null && lastSeenDate > twoMinutesAgo;

      return {
        id: row.id as string,
        name: row.name as string,
        email: row.email as string,
        role: row.role as string,
        status: row.status as string,
        avatar: row.avatar as string | null,
        isActive: Boolean(row.isActive),
        lastLoginAt: row.lastLoginAt as string | null,
        lastActivityAt: row.lastActivityAt as string | null,
        sessionLastSeen: sessionLastSeen,
        isOnline,
      };
    });

    const onlineCount = users.filter(u => u.isOnline).length;

    return NextResponse.json({
      success: true,
      data: {
        users,
        onlineCount,
        totalUsers: users.length,
      },
    });
  } catch (error) {
    console.error('[GET /api/members/activity] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}