import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { updateClientSchema } from '@/lib/validations/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id] — Get client details (SUPERADMIN only)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT "Client".*,
            (SELECT COUNT(*) FROM "Project" WHERE "Project"."clientId" = "Client"."id") as projectCount
            FROM "Client"
            WHERE "Client".id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const row = result.rows[0];

    // Get linked projects
    const projects = await client.execute({
      sql: `SELECT id, name, status, priority, deadline, createdAt FROM "Project" WHERE "clientId" = ?`,
      args: [id],
    });

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
        updatedAt: row.updatedAt,
        projectCount: Number(row.projectCount),
        projects: projects.rows.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          deadline: p.deadline,
          createdAt: p.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('[GET /api/clients/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/clients/[id] — Update client (SUPERADMIN only)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const body = await request.json();
    const result = updateClientSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check client exists
    const existing = await client.execute({
      sql: 'SELECT id, email FROM "Client" WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    // If email changed, check uniqueness
    const updateData = result.data;
    if (updateData.email && updateData.email !== existing.rows[0].email) {
      const emailCheck = await client.execute({
        sql: 'SELECT id FROM "Client" WHERE email = ? AND id != ?',
        args: [updateData.email, id],
      });
      if (emailCheck.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: 'A client with this email already exists' },
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
    if (updateData.notes !== undefined) {
      setClauses.push('"notes" = ?');
      args.push(updateData.notes || null);
    }
    if (updateData.status) {
      setClauses.push('"status" = ?');
      args.push(updateData.status);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('"updatedAt" = ?');
    args.push(now);
    args.push(id);

    await client.execute({
      sql: `UPDATE "Client" SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'UPDATE_CLIENT',
      details: `Updated client: ${JSON.stringify(updateData)}`,
      entity: 'client',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Fetch updated client
    const updated = await client.execute({
      sql: 'SELECT * FROM "Client" WHERE id = ?',
      args: [id],
    });
    const row = updated.rows[0];

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
      },
    });
  } catch (error) {
    console.error('[PUT /api/clients/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/clients/[id] — Soft delete client (SUPERADMIN only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check client exists
    const existing = await client.execute({
      sql: 'SELECT id, name FROM "Client" WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const clientName = existing.rows[0].name as string;
    const now = new Date().toISOString();

    // Soft delete by setting status to INACTIVE
    await client.execute({
      sql: 'UPDATE "Client" SET "status" = ?, "updatedAt" = ? WHERE id = ?',
      args: ['INACTIVE', now, id],
    });

    // Unlink from projects (set clientId to null)
    await client.execute({
      sql: 'UPDATE "Project" SET "clientId" = NULL WHERE "clientId" = ?',
      args: [id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'DELETE_CLIENT',
      details: `Soft-deleted client: ${clientName}`,
      entity: 'client',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    console.error('[DELETE /api/clients/[id]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
