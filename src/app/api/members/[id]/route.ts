import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { updateMemberSchema } from '@/lib/validations/member';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/members/[id] — Get member details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT "User".*,
            (SELECT COUNT(*) FROM "ProjectMember" WHERE "ProjectMember"."userId" = "User"."id" AND "ProjectMember"."removedAt" IS NULL) as projectCount
            FROM "User"
            WHERE "User".id = ? AND "User"."deletedAt" IS NULL`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    const row = result.rows[0];

    // Get project assignments
    const projects = await client.execute({
      sql: `SELECT pm.*, p.name as projectName
            FROM "ProjectMember" pm
            JOIN "Project" p ON pm."projectId" = p.id
            WHERE pm."userId" = ? AND pm."removedAt" IS NULL`,
      args: [id],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        avatar: row.avatar,
        isActive: Boolean(row.isActive),
        jobTitle: row.jobTitle,
        phone: row.phone,
        skills: row.skills,
        status: row.status || 'ACTIVE',
        joinDate: row.joinDate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        projectCount: Number(row.projectCount),
        projects: projects.rows.map((p) => ({
          id: p.id,
          projectId: p.projectId,
          projectName: p.projectName,
          role: p.role,
          joinedAt: p.joinedAt,
          assignedBy: p.assignedBy,
        })),
      },
    });
  } catch (error) {
    console.error('[GET /api/members/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/members/[id] — Update member (ADMIN+ only)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN', 'ADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const body = await request.json();
    const result = updateMemberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check member exists
    const existing = await client.execute({
      sql: 'SELECT id, email FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // If email changed, check uniqueness
    const updateData = result.data;
    if (updateData.email && updateData.email !== existing.rows[0].email) {
      const emailCheck = await client.execute({
        sql: 'SELECT id FROM "User" WHERE email = ? AND id != ? AND "deletedAt" IS NULL',
        args: [updateData.email, id],
      });
      if (emailCheck.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const args: unknown[] = [];
    const now = new Date().toISOString();

    if (updateData.name) {
      setClauses.push('"name" = ?');
      args.push(updateData.name);
    }
    if (updateData.email) {
      setClauses.push('"email" = ?');
      args.push(updateData.email);
    }
    if (updateData.jobTitle !== undefined) {
      setClauses.push('"jobTitle" = ?');
      args.push(updateData.jobTitle || null);
    }
    if (updateData.phone !== undefined) {
      setClauses.push('"phone" = ?');
      args.push(updateData.phone || null);
    }
    if (updateData.skills !== undefined) {
      setClauses.push('"skills" = ?');
      args.push(updateData.skills || null);
    }
    if (updateData.role) {
      setClauses.push('"role" = ?');
      args.push(updateData.role);
    }
    if (updateData.status) {
      setClauses.push('"status" = ?');
      args.push(updateData.status);
    }
    if (updateData.joinDate) {
      setClauses.push('"joinDate" = ?');
      args.push(updateData.joinDate);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('"updatedAt" = ?');
    args.push(now);
    args.push(id);

    await client.execute({
      sql: `UPDATE "User" SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'UPDATE_MEMBER',
      details: `Updated member: ${JSON.stringify(updateData)}`,
      entity: 'member',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Fetch updated member
    const updated = await client.execute({
      sql: 'SELECT * FROM "User" WHERE id = ?',
      args: [id],
    });
    const row = updated.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        jobTitle: row.jobTitle,
        phone: row.phone,
        skills: row.skills,
        status: row.status || 'ACTIVE',
        joinDate: row.joinDate,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/members/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/members/[id] — Soft delete (ADMIN+ only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN', 'ADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check member exists
    const existing = await client.execute({
      sql: 'SELECT id, name FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    const memberName = existing.rows[0].name as string;
    const now = new Date().toISOString();

    // Soft delete user
    await client.execute({
      sql: 'UPDATE "User" SET "deletedAt" = ?, "updatedAt" = ? WHERE id = ?',
      args: [now, now, id],
    });

    // Remove from all project memberships (set removedAt)
    await client.execute({
      sql: 'UPDATE "ProjectMember" SET "removedAt" = ? WHERE "userId" = ? AND "removedAt" IS NULL',
      args: [now, id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'DELETE_MEMBER',
      details: `Soft-deleted member: ${memberName}`,
      entity: 'member',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('[DELETE /api/members/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
