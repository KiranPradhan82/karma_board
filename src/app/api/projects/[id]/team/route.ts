import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { assignTeamMemberSchema } from '@/lib/validations/member';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/team — Get project team
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();

    // Check project exists
    const project = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [id],
    });

    if (project.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    // Get team members
    const result = await client.execute({
      sql: `SELECT pm.*, u.name, u.email, u.avatar, u.jobTitle, u.status as userStatus
            FROM "ProjectMember" pm
            JOIN "User" u ON pm."userId" = u.id
            WHERE pm."projectId" = ? AND pm."removedAt" IS NULL AND u."deletedAt" IS NULL
            ORDER BY pm."joinedAt" ASC`,
      args: [id],
    });

    const members = result.rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt,
      assignedBy: row.assignedBy,
      user: {
        name: row.name,
        email: row.email,
        avatar: row.avatar,
        jobTitle: row.jobTitle,
        status: row.userStatus || 'ACTIVE',
      },
    }));

    // Resolve assignedBy names
    for (const member of members) {
      if (member.assignedBy) {
        const assigner = await client.execute({
          sql: 'SELECT name FROM "User" WHERE id = ?',
          args: [member.assignedBy],
        });
        if (assigner.rows.length > 0) {
          (member as Record<string, unknown>).assignedByName = assigner.rows[0].name;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        project: { id, name: project.rows[0].name },
        members,
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/team] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[id]/team — Add member to project (ADMIN+ or Project LEAD)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check user is ADMIN, SUPERADMIN, or Project LEAD
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      const leadCheck = await client.execute({
        sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND role = ? AND "removedAt" IS NULL',
        args: [id, user.id, 'LEAD'],
      });
      if (leadCheck.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Only admins or project leads can add members' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = assignTeamMemberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { userId, role } = result.data;

    // Enforce: Only SUPERADMIN can assign someone as LEAD
    if (role === 'LEAD') {
      if (user.role !== 'SUPERADMIN') {
        return NextResponse.json({ success: false, error: 'Only super admin can assign or change the team lead' }, { status: 403 });
      }
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

    // Check project exists
    const project = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [id],
    });
    if (project.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    // Check user exists and not deleted
    const targetUser = await client.execute({
      sql: 'SELECT id, name FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
      args: [userId],
    });
    if (targetUser.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Check if already in project (active)
    const existing = await client.execute({
      sql: 'SELECT id, "removedAt" FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ?',
      args: [id, userId],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (!row.removedAt) {
        return NextResponse.json({ success: false, error: 'User is already a member of this project' }, { status: 409 });
      }
      // Previously removed — re-add by clearing removedAt and updating role
      const now = new Date().toISOString();
      await client.execute({
        sql: 'UPDATE "ProjectMember" SET "removedAt" = NULL, role = ?, "assignedBy" = ?, "joinedAt" = ? WHERE id = ?',
        args: [role, user.id, now, row.id],
      });
    } else {
      // New assignment
      const now = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt", "assignedBy")
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), id, userId, role, now, user.id],
      });
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'ADD_PROJECT_MEMBER',
      details: `Added ${targetUser.rows[0].name} (${role}) to project ${project.rows[0].name}`,
      entity: 'project_team',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Return updated membership
    const updated = await client.execute({
      sql: `SELECT pm.*, u.name, u.email
            FROM "ProjectMember" pm
            JOIN "User" u ON pm."userId" = u.id
            WHERE pm."projectId" = ? AND pm."userId" = ? AND pm."removedAt" IS NULL`,
      args: [id, userId],
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          projectMember: {
            id: updated.rows[0].id,
            projectId: id,
            userId,
            role,
            assignedBy: user.id,
            user: {
              name: updated.rows[0].name,
              email: updated.rows[0].email,
            },
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/projects/[id]/team] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/team — Remove member from project (ADMIN+ or Project LEAD)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check user is ADMIN, SUPERADMIN, or Project LEAD
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      const leadCheck = await client.execute({
        sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND role = ? AND "removedAt" IS NULL',
        args: [id, user.id, 'LEAD'],
      });
      if (leadCheck.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Only admins or project leads can remove members' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    // Prevent removal of SUPERADMIN users — they are always auto-assigned
    const targetUserForDelete = await client.execute({
      sql: 'SELECT role FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
      args: [userId],
    });
    if (targetUserForDelete.rows.length > 0 && targetUserForDelete.rows[0].role === "SUPERADMIN") {
      return NextResponse.json({ success: false, error: 'Super admin cannot be removed from a project' }, { status: 403 });
    }

    // Check membership exists
    const membership = await client.execute({
      sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL',
      args: [id, userId],
    });

    if (membership.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User is not a member of this project' }, { status: 404 });
    }

    // Get user name for log
    const targetUser = await client.execute({
      sql: 'SELECT name FROM "User" WHERE id = ?',
      args: [userId],
    });

    const now = new Date().toISOString();
    await client.execute({
      sql: 'UPDATE "ProjectMember" SET "removedAt" = ? WHERE id = ?',
      args: [now, membership.rows[0].id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'REMOVE_PROJECT_MEMBER',
      details: `Removed ${targetUser.rows[0]?.name || userId} from project`,
      entity: 'project_team',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: 'Member removed from project' });
  } catch (error) {
    console.error('[DELETE /api/projects/[id]/team] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
