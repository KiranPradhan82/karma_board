import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/members/[id]/restore — Restore soft-deleted member (SUPERADMIN only)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole('SUPERADMIN')(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check member exists and is deleted
    const existing = await client.execute({
      sql: 'SELECT id, name FROM "User" WHERE id = ? AND "deletedAt" IS NOT NULL',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Deleted member not found' }, { status: 404 });
    }

    const memberName = existing.rows[0].name as string;
    const now = new Date().toISOString();

    // Restore user
    await client.execute({
      sql: 'UPDATE "User" SET "deletedAt" = NULL, "updatedAt" = ? WHERE id = ?',
      args: [now, id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'RESTORE_MEMBER',
      details: `Restored member: ${memberName}`,
      entity: 'member',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: 'Member restored successfully' });
  } catch (error) {
    console.error('[POST /api/members/[id]/restore] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
