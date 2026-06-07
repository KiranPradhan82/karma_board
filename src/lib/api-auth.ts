import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

export interface AuthUser {
  id: string;
  role: string;
  email?: string;
  name?: string;
}

/**
 * Get the authenticated user from the JWT token in the request.
 * Returns null if not authenticated.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || !token.id) {
      return null;
    }

    return {
      id: token.id as string,
      role: token.role as string,
      email: token.email as string | undefined,
      name: token.name as string | undefined,
    };
  } catch (error) {
    console.error('[api-auth] Error getting auth user:', error);
    return null;
  }
}

/**
 * Create a role checker function that returns a 403 if the user doesn't have the required role.
 */
export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return function (user: AuthUser): NextResponse | null {
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    return null;
  };
}

/**
 * Get a Turso client for database operations.
 */
export function getTursoClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    // Strip any embedded authToken from URL query string to avoid sending it twice
    const cleanUrl = tursoUrl.split('?')[0];
    return createClient({
      url: cleanUrl,
      authToken: tursoToken,
    });
  }

  // Fallback to local SQLite via libsql file URL (only works in local dev)
  const localPath = `file:${process.cwd()}/db/custom.db`;
  console.warn(`[getTursoClient] No TURSO_DATABASE_URL/TURSO_AUTH_TOKEN set, falling back to: ${localPath}`);
  return createClient({ url: localPath });
}

/**
 * Log an activity to the ActivityLog table.
 */
export async function logActivity(params: {
  userId: string;
  action: string;
  details?: string;
  entity?: string;
  entityId?: string;
  ipAddress?: string;
  tursoClient: ReturnType<typeof getTursoClient>;
}): Promise<void> {
  try {
    const { userId, action, details, entity, entityId, ipAddress, tursoClient } = params;

    await tursoClient.execute({
      sql: `INSERT INTO "ActivityLog" (id, userId, action, details, entity, entityId, ipAddress, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        crypto.randomUUID(),
        userId,
        action,
        details || null,
        entity || null,
        entityId || null,
        ipAddress || null,
      ],
    });
  } catch (error) {
    console.error('[api-auth] Error logging activity:', error);
  }
}

/**
 * Extract client IP from the request.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'unknown';
}
