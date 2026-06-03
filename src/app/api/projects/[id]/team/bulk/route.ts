import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { bulkAssignSchema } from '@/lib/validations/member';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/team/bulk — Bulk add members
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheckResult = (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN');
    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    if (roleCheckResult) {
      const leadCheck = await client.execute({
        sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND role = ? AND "removedAt" IS NULL',
        args: [id, user.id, 'LEAD'],
      });
      if (leadCheck.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Only admins or project leads can add members' }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = bulkAssignSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { members } = result.data;

    // Check project exists
    const project = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [id],
    });
    if (project.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const member of members) {
      try {
        // Check user exists
        const targetUser = await client.execute({
          sql: 'SELECT id, name FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
          args: [member.userId],
        });
        if (targetUser.rows.length === 0) {
          errors.push(`User ${member.userId} not found`);
          continue;
        }

        // Check existing membership
        const existing = await client.execute({
          sql: 'SELECT id, "removedAt" FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ?',
          args: [id, member.userId],
        });

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          if (!row.removedAt) {
            skipped++;
            continue;
          }
          // Re-add previously removed
          await client.execute({
            sql: 'UPDATE "ProjectMember" SET "removedAt" = NULL, role = ?, "assignedBy" = ?, "joinedAt" = ? WHERE id = ?',
            args: [member.role, user.id, now, row.id],
          });
          added++;
        } else {
          await client.execute({
            sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt", "assignedBy")
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, member.userId, member.role, now, user.id],
          });
          added++;
        }
      } catch (err) {
        errors.push(`Error adding ${member.userId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'BULK_ADD_PROJECT_MEMBERS',
      details: `Bulk added ${added} members (skipped ${skipped}) to project ${project.rows[0].name}`,
      entity: 'project_team',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: { added, skipped, errors },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/team/bulk] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
