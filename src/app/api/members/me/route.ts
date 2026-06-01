import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';

// GET /api/members/me — Get own profile
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT "User".*,
            (SELECT COUNT(*) FROM "ProjectMember" WHERE "ProjectMember"."userId" = "User"."id" AND "ProjectMember"."removedAt" IS NULL) as projectCount
            FROM "User"
            WHERE "User".id = ? AND "User"."deletedAt" IS NULL`,
      args: [user.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const row = result.rows[0];

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
      },
    });
  } catch (error) {
    console.error('[GET /api/members/me] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/members/me — Update own profile
// Users can only update: name, jobTitle, phone, skills, password
// They CANNOT change: email, role, status
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Only allow these fields for self-update
    const allowedFields = ['name', 'jobTitle', 'phone', 'skills', 'currentPassword', 'newPassword'];
    const updateFields: Record<string, unknown> = {};

    for (const key of Object.keys(body)) {
      if (!allowedFields.includes(key)) {
        return NextResponse.json(
          { success: false, error: `Field '${key}' is not allowed for self-update` },
          { status: 400 }
        );
      }
    }

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'Name must be at least 2 characters' },
          { status: 400 }
        );
      }
      updateFields.name = body.name.trim();
    }

    // Validate jobTitle if provided
    if (body.jobTitle !== undefined) {
      updateFields.jobTitle = typeof body.jobTitle === 'string' ? (body.jobTitle.trim() || null) : null;
    }

    // Validate phone if provided
    if (body.phone !== undefined) {
      updateFields.phone = typeof body.phone === 'string' ? (body.phone.trim() || null) : null;
    }

    // Validate skills if provided
    if (body.skills !== undefined) {
      if (Array.isArray(body.skills)) {
        updateFields.skills = body.skills.length > 0 ? JSON.stringify(body.skills) : null;
      } else if (typeof body.skills === 'string') {
        updateFields.skills = body.skills.trim() || null;
      }
    }

    // Handle password change
    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change password' },
          { status: 400 }
        );
      }

      if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
        return NextResponse.json(
          { success: false, error: 'New password must be at least 8 characters' },
          { status: 400 }
        );
      }

      if (!/[a-zA-Z]/.test(body.newPassword) || !/[0-9]/.test(body.newPassword)) {
        return NextResponse.json(
          { success: false, error: 'Password needs at least one letter and one number' },
          { status: 400 }
        );
      }

      // Verify current password
      const { hashPassword, verifyPassword } = await import('@/lib/auth-utils');
      const existingUser = await client.execute({
        sql: 'SELECT password FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
        args: [user.id],
      });

      if (existingUser.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }

      const currentHash = existingUser.rows[0].password as string;
      const isValid = await verifyPassword(body.currentPassword, currentHash);

      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 401 }
        );
      }

      updateFields.password = await hashPassword(body.newPassword);
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const args: unknown[] = [];
    const now = new Date().toISOString();

    if (updateFields.name) {
      setClauses.push('"name" = ?');
      args.push(updateFields.name);
    }
    if (updateFields.jobTitle !== undefined) {
      setClauses.push('"jobTitle" = ?');
      args.push(updateFields.jobTitle);
    }
    if (updateFields.phone !== undefined) {
      setClauses.push('"phone" = ?');
      args.push(updateFields.phone);
    }
    if (updateFields.skills !== undefined) {
      setClauses.push('"skills" = ?');
      args.push(updateFields.skills);
    }
    if (updateFields.password) {
      setClauses.push('"password" = ?');
      args.push(updateFields.password);
    }

    setClauses.push('"updatedAt" = ?');
    args.push(now);
    args.push(user.id);

    await client.execute({
      sql: `UPDATE "User" SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Audit log
    const logDetails: string[] = [];
    if (updateFields.name) logDetails.push(`name to "${updateFields.name}"`);
    if (updateFields.jobTitle !== undefined) logDetails.push(`jobTitle to "${updateFields.jobTitle}"`);
    if (updateFields.phone !== undefined) logDetails.push(`phone to "${updateFields.phone}"`);
    if (updateFields.skills !== undefined) logDetails.push('skills');
    if (updateFields.password) logDetails.push('password');

    await logActivity({
      userId: user.id,
      action: 'UPDATE_OWN_PROFILE',
      details: `Updated own profile: ${logDetails.join(', ')}`,
      entity: 'member',
      entityId: user.id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Fetch updated user
    const updated = await client.execute({
      sql: 'SELECT * FROM "User" WHERE id = ?',
      args: [user.id],
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
    console.error('[PATCH /api/members/me] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
