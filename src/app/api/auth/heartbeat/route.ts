import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const client = getTursoClient();
    const now = new Date().toISOString();
    const sessionId = `session_${user.id}_active`;

    // Upsert session
    await client.execute({
      sql: `INSERT INTO "UserSession" (id, "userId", "lastSeen", "ipAddress", "userAgent")
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET "lastSeen" = excluded."lastSeen"`,
      args: [sessionId, user.id, now, request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null, request.headers.get('user-agent') || null],
    });

    // Update user's last activity
    await client.execute({
      sql: 'UPDATE "User" SET "lastActivityAt" = datetime(\'now\') WHERE id = ?',
      args: [user.id],
    });

    // Clean up stale sessions (older than 6 minutes)
    await client.execute({
      sql: `DELETE FROM "UserSession" WHERE "lastSeen" < datetime('now', '-6 minutes')`,
      args: [],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/auth/heartbeat] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}