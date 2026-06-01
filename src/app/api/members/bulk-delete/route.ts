import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { bulkDeleteSchema } from '@/lib/validations/member';

// POST /api/members/bulk-delete — Bulk soft delete (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole('SUPERADMIN')(user);
    if (roleCheck) return roleCheck;

    const body = await request.json();
    const result = bulkDeleteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { ids } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);
    const now = new Date().toISOString();

    let deleted = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        // Check member exists and is not already deleted
        const existing = await client.execute({
          sql: 'SELECT id, name FROM "User" WHERE id = ? AND "deletedAt" IS NULL',
          args: [id],
        });

        if (existing.rows.length === 0) {
          errors.push(`Member ${id} not found or already deleted`);
          continue;
        }

        // Soft delete
        await client.execute({
          sql: 'UPDATE "User" SET "deletedAt" = ?, "updatedAt" = ? WHERE id = ?',
          args: [now, now, id],
        });

        // Remove from project memberships
        await client.execute({
          sql: 'UPDATE "ProjectMember" SET "removedAt" = ? WHERE "userId" = ? AND "removedAt" IS NULL',
          args: [now, id],
        });

        // Audit log for each member
        await logActivity({
          userId: user.id,
          action: 'BULK_DELETE_MEMBER',
          details: `Bulk soft-deleted member: ${existing.rows[0].name}`,
          entity: 'member',
          entityId: id,
          ipAddress: ip,
          tursoClient: client,
        });

        deleted++;
      } catch (err) {
        errors.push(`Error deleting ${id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { deleted, total: ids.length, errors },
    });
  } catch (error) {
    console.error('[POST /api/members/bulk-delete] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
