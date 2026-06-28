import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

/**
 * GET /api/branding — Public endpoint, no auth required.
 * Returns the custom logo (data URL) and app name so login pages,
 * emails, etc. can show the correct branding.
 */
export async function GET() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (!tursoUrl || !tursoToken) {
      return NextResponse.json({ success: true, data: { logo: null } });
    }

    const cleanUrl = tursoUrl.split('?')[0];
    const client = createClient({ url: cleanUrl, authToken: tursoToken });

    const result = await client.execute({
      sql: 'SELECT value FROM "Settings" WHERE key = ?',
      args: ['BRANDING_LOGO'],
    });

    const logo = result.rows.length > 0 ? (result.rows[0].value as string) : null;

    return NextResponse.json({ success: true, data: { logo } });
  } catch (error) {
    console.error('[GET /api/branding] Error:', error);
    return NextResponse.json({ success: true, data: { logo: null } });
  }
}