import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient, getClientIp } from '@/lib/api-auth';
import { updateClientProfileSchema } from '@/lib/validations/client';
import { logActivity } from '@/lib/api-auth';

// GET /api/clients/me — Get current client profile
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id || token.accountType !== 'client') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const client = getTursoClient();
    const clientId = token.id as string;

    const result = await client.execute({
      sql: `SELECT id, name, email, company, address, phone, notes, status, "mustChangePassword", createdAt
            FROM "Client" WHERE id = ?`,
      args: [clientId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const row = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('[GET /api/clients/me] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/clients/me — Update current client profile
export async function PUT(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id || token.accountType !== 'client') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const clientId = token.id as string;
    const body = await request.json();
    const result = updateClientProfileSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    const updateData = result.data;
    const setClauses: string[] = [];
    const args: unknown[] = [];
    const now = new Date().toISOString();

    if (updateData.name) {
      setClauses.push('"name" = ?');
      args.push(updateData.name);
    }
    if (updateData.company !== undefined) {
      setClauses.push('"company" = ?');
      args.push(updateData.company || null);
    }
    if (updateData.address !== undefined) {
      setClauses.push('"address" = ?');
      args.push(updateData.address || null);
    }
    if (updateData.phone !== undefined) {
      setClauses.push('"phone" = ?');
      args.push(updateData.phone || null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('"updatedAt" = ?');
    args.push(now);
    args.push(clientId);

    await client.execute({
      sql: `UPDATE "Client" SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Simple audit (client as self)
    try {
      await logActivity({
        userId: clientId,
        action: 'UPDATE_CLIENT_PROFILE',
        details: `Client updated their profile`,
        entity: 'client',
        entityId: clientId,
        ipAddress: ip,
        tursoClient: client,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('[PUT /api/clients/me] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
