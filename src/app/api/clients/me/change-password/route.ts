import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient } from '@/lib/api-auth';
import { hashPassword } from '@/lib/auth-utils';

// POST /api/clients/me/change-password — Set new password for client first-time login
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id || token.accountType !== 'client') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { newPassword } = body;

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
    const clientId = token.id as string;
    const now = new Date().toISOString();
    const hashedPassword = await hashPassword(newPassword);

    await client.execute({
      sql: `UPDATE "Client" SET password = ?, "mustChangePassword" = 0, "updatedAt" = ? WHERE id = ?`,
      args: [hashedPassword, now, clientId],
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('[POST /api/clients/me/change-password] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
