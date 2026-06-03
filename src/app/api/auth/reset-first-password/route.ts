import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient, getClientIp } from '@/lib/api-auth';
import { hashPassword } from '@/lib/auth-utils';

// POST /api/auth/reset-first-password — Set new password for first-time login
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only allow this endpoint if mustChangePassword is true
    if (!token.mustChangePassword) {
      return NextResponse.json(
        { success: false, error: 'Password change not required. Use the profile page to change your password.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { newPassword } = body;

    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { success: false, error: 'New password is required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, error: 'Password must contain at least one letter and one number' },
        { status: 400 }
      );
    }

    const client = getTursoClient();
    const userId = token.id as string;
    const now = new Date().toISOString();
    const hashedPassword = await hashPassword(newPassword);

    // Update password and clear mustChangePassword flag
    await client.execute({
      sql: `UPDATE "User" SET password = ?, "mustChangePassword" = 0, "updatedAt" = ? WHERE id = ?`,
      args: [hashedPassword, now, userId],
    });

    // Audit log (use a simple direct insert)
    try {
      const ip = getClientIp(request);
      await client.execute({
        sql: `INSERT INTO "ActivityLog" (id, userId, action, details, entity, entityId, ipAddress, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          crypto.randomUUID(),
          userId,
          'RESET_FIRST_PASSWORD',
          'Changed password on first login',
          'member',
          userId,
          ip,
        ],
      });
    } catch (logErr) {
      console.error('[reset-first-password] Audit log failed:', logErr);
      // Non-critical — don't fail the password reset
    }

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('[POST /api/auth/reset-first-password] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
