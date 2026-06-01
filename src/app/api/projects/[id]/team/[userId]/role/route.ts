import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { changeProjectRoleSchema } from '@/lib/validations/member';

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

// PATCH /api/projects/[id]/team/[userId]/role — Change project role
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id, userId } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check user is ADMIN, SUPERADMIN, or Project LEAD
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      const leadCheck = await client.execute({
        sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND role = ? AND "removedAt" IS NULL',
        args: [id, user.id, 'LEAD'],
      });
      if (leadCheck.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Only admins or project leads can change roles' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = changeProjectRoleSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { role } = result.data;

    // Check membership exists
    const membership = await client.execute({
      sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL',
      args: [id, userId],
    });

    if (membership.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User is not a member of this project' }, { status: 404 });
    }

    // Update role
    await client.execute({
      sql: 'UPDATE "ProjectMember" SET role = ? WHERE id = ?',
      args: [role, membership.rows[0].id],
    });

    // Get user name for log
    const targetUser = await client.execute({
      sql: 'SELECT name FROM "User" WHERE id = ?',
      args: [userId],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'CHANGE_PROJECT_ROLE',
      details: `Changed role of ${targetUser.rows[0]?.name || userId} to ${role} in project ${id}`,
      entity: 'project_team',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        projectId: id,
        userId,
        role,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]/team/[userId]/role] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
