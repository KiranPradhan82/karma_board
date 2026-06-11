import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { createMemberSchema } from '@/lib/validations/member';
import { hashPassword } from '@/lib/auth-utils';
import { sendWelcomeEmail } from '@/lib/email';

// GET /api/members — List members with search, filter, pagination
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const role = searchParams.get('role') || '';
    const skills = searchParams.get('skills') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const client = getTursoClient();

    // Build WHERE clauses
    const conditions: string[] = [`"User"."deletedAt" IS NULL`];
    const args: unknown[] = [];

    if (search) {
      conditions.push(`("User"."name" LIKE ? OR "User"."email" LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push(`"User"."status" = ?`);
      args.push(status);
    }
    if (role) {
      conditions.push(`"User"."role" = ?`);
      args.push(role);
    }
    if (skills) {
      const skillList = skills.split(',').map(s => s.trim());
      for (const skill of skillList) {
        conditions.push(`"User"."skills" LIKE ?`);
        args.push(`%"${skill}"%`);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Validate sort
    const validSortColumns = ['name', 'createdAt', 'joinDate', 'role', 'status'];
    const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "User" WHERE ${whereClause}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    // Get members with project count
    const offset = (page - 1) * limit;
    const memberArgs = [...args, limit, offset];

    const result = await client.execute({
      sql: `SELECT "User".*,
            (SELECT COUNT(*) FROM "ProjectMember" WHERE "ProjectMember"."userId" = "User"."id" AND "ProjectMember"."removedAt" IS NULL) as projectCount
            FROM "User"
            WHERE ${whereClause}
            ORDER BY "${sortCol}" ${sortDir}
            LIMIT ? OFFSET ?`,
      args: memberArgs,
    });

    const members = result.rows.map((row) => ({
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
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        members,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/members] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const isConnectionError = /connect|fetch|network|timeout|turso|libsql|ENOTFOUND|ECONNREFUSED|database|TURSO/i.test(msg);
    return NextResponse.json({ success: false, error: isConnectionError ? 'Database connection failed. Please check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel.' : `Internal server error: ${msg}` }, { status: 500 });
  }
}

// POST /api/members — Create member (ADMIN+ only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN', 'ADMIN'])(user);
    if (roleCheck) return roleCheck;

    const body = await request.json();
    const result = createMemberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, email, jobTitle, phone, skills, role } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check for existing email (including soft-deleted — UNIQUE constraint blocks duplicates)
    const existing = await client.execute({
      sql: 'SELECT id, "deletedAt" FROM "User" WHERE email = ?',
      args: [email],
    });

    if (existing.rows.length > 0) {
      const isDeleted = existing.rows[0].deletedAt !== null;
      if (isDeleted) {
        // Hard-delete the old soft-deleted record to free up the email for reuse
        const oldId = existing.rows[0].id as string;
        // Clean up related records (no FK cascade in raw SQL)
        await client.execute({ sql: `DELETE FROM "Invitation" WHERE email = ?`, args: [email] });
        await client.execute({ sql: `DELETE FROM "AiChat" WHERE "userId" = ?`, args: [oldId] });
        await client.execute({ sql: `DELETE FROM "ProjectMember" WHERE "userId" = ?`, args: [oldId] });
        await client.execute({ sql: `DELETE FROM "ActivityLog" WHERE "userId" = ?`, args: [oldId] });
        await client.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [oldId] });
        console.log(`[POST /api/members] Hard-deleted previously soft-deleted user ${oldId} to free email ${email}`);
      } else {
        return NextResponse.json(
          { success: false, error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
    }

    // Generate a temporary password (12 chars, letters + digits)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let temporaryPassword = '';
    for (let i = 0; i < 12; i++) {
      temporaryPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashedPassword = await hashPassword(temporaryPassword);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await client.execute({
        sql: `INSERT INTO "User" (id, name, email, password, role, jobTitle, phone, skills, status, "mustChangePassword", joinDate, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?)`,
        args: [id, name, email, hashedPassword, role, jobTitle || null, phone || null, skills || null, now, now, now],
      });
    } catch (dbError: unknown) {
      const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
      if (dbMsg.includes('UNIQUE constraint failed')) {
        return NextResponse.json(
          { success: false, error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
      throw dbError; // re-throw unexpected DB errors
    }

    // Send welcome email with temporary password (non-blocking — member is created regardless)
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://karma-board.vercel.app';
    let emailResult: { success: boolean; error?: string } = { success: false, error: 'Email not attempted' };
    try {
      emailResult = await sendWelcomeEmail({
        to: email,
        name,
        temporaryPassword,
        loginUrl: `${baseUrl}/login`,
      });
    } catch (emailError) {
      const msg = emailError instanceof Error ? emailError.message : String(emailError);
      console.error(`[POST /api/members] Email error: ${msg}`);
      emailResult = { success: false, error: msg };
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'CREATE_MEMBER',
      details: `Created member: ${name} (${email}) with role ${role}. Welcome email sent: ${emailResult.success}`,
      entity: 'member',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id,
          name,
          email,
          role,
          jobTitle: jobTitle || null,
          phone: phone || null,
          skills: skills || null,
          status: 'ACTIVE',
          emailSent: emailResult.success,
          emailError: emailResult.error || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/members] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const isConnectionError = /connect|fetch|network|timeout|turso|libsql|ENOTFOUND|ECONNREFUSED|database|TURSO/i.test(msg);
    return NextResponse.json({ success: false, error: isConnectionError ? 'Database connection failed. Please check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel.' : `Internal server error: ${msg}` }, { status: 500 });
  }
}
