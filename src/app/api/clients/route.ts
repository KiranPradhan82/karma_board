import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { createClientSchema } from '@/lib/validations/client';
import { hashPassword } from '@/lib/auth-utils';
import { sendClientWelcomeEmail } from '@/lib/email';

// GET /api/clients — List clients (SUPERADMIN only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const client = getTursoClient();

    // Build WHERE clauses
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (search) {
      conditions.push(`("Client"."name" LIKE ? OR "Client"."email" LIKE ? OR "Client"."company" LIKE ?)`);
      args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push(`"Client"."status" = ?`);
      args.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort
    const validSortColumns = ['name', 'email', 'company', 'createdAt', 'status'];
    const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "Client" ${whereClause}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    // Get clients with project count
    const offset = (page - 1) * limit;
    const clientArgs = [...args, limit, offset];

    const result = await client.execute({
      sql: `SELECT "Client".*,
            (SELECT COUNT(*) FROM "Project" WHERE "Project"."clientId" = "Client"."id") as projectCount
            FROM "Client"
            ${whereClause}
            ORDER BY "${sortCol}" ${sortDir}
            LIMIT ? OFFSET ?`,
      args: clientArgs,
    });

    const clients = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      company: row.company,
      address: row.address,
      phone: row.phone,
      notes: row.notes,
      status: row.status || 'ACTIVE',
      mustChangePassword: Boolean(row.mustChangePassword),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      projectCount: Number(row.projectCount),
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        clients,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/clients] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/clients — Create client (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN'])(user);
    if (roleCheck) return roleCheck;

    const body = await request.json();
    const result = createClientSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, email, company, address, phone, notes } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check for existing email
    const existing = await client.execute({
      sql: 'SELECT id FROM "Client" WHERE email = ?',
      args: [email],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'A client with this email already exists' },
        { status: 409 }
      );
    }

    // Generate a temporary password
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
        sql: `INSERT INTO "Client" (id, name, email, password, company, address, phone, notes, status, "mustChangePassword", createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
        args: [id, name, email, hashedPassword, company || null, address || null, phone || null, notes || null, now, now],
      });
    } catch (dbError: unknown) {
      const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
      if (dbMsg.includes('UNIQUE constraint failed')) {
        return NextResponse.json(
          { success: false, error: 'A client with this email already exists' },
          { status: 409 }
        );
      }
      throw dbError;
    }

    // Send welcome email
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://karma-board.vercel.app';
    let emailResult: { success: boolean; error?: string } = { success: false, error: 'Email not attempted' };
    try {
      emailResult = await sendClientWelcomeEmail({
        to: email,
        name,
        temporaryPassword,
        loginUrl: `${baseUrl}/client/login`,
      });
    } catch (emailError) {
      const msg = emailError instanceof Error ? emailError.message : String(emailError);
      console.error(`[POST /api/clients] Email error: ${msg}`);
      emailResult = { success: false, error: msg };
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'CREATE_CLIENT',
      details: `Created client: ${name} (${email}). Welcome email sent: ${emailResult.success}`,
      entity: 'client',
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
          company: company || null,
          address: address || null,
          phone: phone || null,
          notes: notes || null,
          status: 'ACTIVE',
          emailSent: emailResult.success,
          emailError: emailResult.error || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/clients] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `Internal server error: ${msg}` }, { status: 500 });
  }
}
