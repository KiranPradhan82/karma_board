import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { changeProjectRoleSchema } from '@/lib/validations/member';
import { notifyRoleChanged } from '@/lib/notify';

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

    // Only SUPERADMIN can change project roles
    if (user.role !== 'SUPERADMIN') {
      return NextResponse.json({ success: false, error: 'Only super admin can change project roles' }, { status: 403 });
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

    // Enforce: Only ADMIN/SUPERADMIN global role can be LEAD
    if (role === 'LEAD') {
      const targetUser = await client.execute({
        sql: 'SELECT role FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
        args: [userId],
      });
      if (targetUser.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
      if (targetUser.rows[0].role !== 'ADMIN' && targetUser.rows[0].role !== 'SUPERADMIN') {
        return NextResponse.json({ success: false, error: 'Only admins can be assigned as Team Lead' }, { status: 400 });
      }
      // Multiple LEADs allowed — no restriction
    }

    // Check membership exists
    const membership = await client.execute({
      sql: 'SELECT id, role FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL',
      args: [id, userId],
    });

    if (membership.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User is not a member of this project' }, { status: 404 });
    }

    // Capture old role before updating
    const oldRole = (membership.rows[0].role as string) || 'MEMBER';

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

    // Get project name
    const projectResult = await client.execute({
      sql: 'SELECT name FROM "Project" WHERE id = ?',
      args: [id],
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

    // Notify user about role change (fire-and-forget)
    const projectName = projectResult.rows[0]?.name as string;
    notifyRoleChanged({
      userId,
      projectName,
      projectId: id,
      oldRole,
      newRole: role,
      changedByName: user.name || "Admin",
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
