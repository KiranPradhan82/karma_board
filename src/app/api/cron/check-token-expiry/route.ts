import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/api-auth';
import { sendTokenExpiryEmail } from '@/lib/email';

/**
 * GET /api/cron/check-token-expiry
 *
 * Cron endpoint that checks if any stored PATs or database tokens have reached
 * their expiry date. If so, sends an email notification to all SUPERADMIN users
 * reminding them to regenerate the token.
 *
 * Designed to be called daily (e.g., via Vercel Cron or external cron scheduler).
 * Protected by a CRON_SECRET bearer token to prevent unauthorized calls.
 *
 * Tokens to check:
 *   - GITHUB_PAT_EXPIRY  (GitHub Personal Access Token)
 *   - DB_TOKEN_EXPIRY    (Database Auth Token)
 */
export async function GET(request: NextRequest) {
  // --- Auth: Require CRON_SECRET bearer token ---
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron/check-token-expiry] CRON_SECRET not set in environment');
    return NextResponse.json(
      { success: false, error: 'Cron secret not configured' },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const client = getTursoClient();

    // Get today's date in YYYY-MM-DD format (UTC)
    const today = new Date().toISOString().split('T')[0];

    // Fetch all expiry settings
    const expiryResult = await client.execute({
      sql: `SELECT key, value FROM "Settings" WHERE key IN ('GITHUB_PAT_EXPIRY', 'DB_TOKEN_EXPIRY')`,
      args: [],
    });

    if (expiryResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No token expiry dates configured',
        checkedAt: today,
        notificationsSent: 0,
      });
    }

    // Fetch all SUPERADMIN users to notify
    const usersResult = await client.execute({
      sql: `SELECT id, name, email, role FROM "User" WHERE role = 'SUPERADMIN' AND "isActive" = true`,
      args: [],
    });

    if (usersResult.rows.length === 0) {
      console.log('[cron/check-token-expiry] No active SUPERADMIN users found');
      return NextResponse.json({
        success: true,
        message: 'No active super admin users to notify',
        checkedAt: today,
        notificationsSent: 0,
      });
    }

    const superAdmins = usersResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
    }));

    // Build the dashboard URL from the request
    const dashboardUrl = process.env.NEXTAUTH_URL || `${new URL(request.url).origin}/dashboard`;

    const notificationsSent: { tokenType: string; expiryDate: string; recipients: string[] }[] = [];

    // Check each expiry setting
    for (const row of expiryResult.rows) {
      const key = row.key as string;
      const expiryDate = row.value as string;

      // Only send notification if expiry date is today or in the past
      // We only send once on the exact expiry date
      if (expiryDate === today) {
        const tokenType = key === 'GITHUB_PAT_EXPIRY' ? 'GitHub PAT' as const : 'Database Auth Token' as const;

        // Check if we already sent a notification for this key on this date
        const alreadySent = await client.execute({
          sql: `SELECT key FROM "Settings" WHERE key = ?`,
          args: [`TOKEN_EXPIRY_NOTIFIED:${key}:${today}`],
        });

        if (alreadySent.rows.length > 0) {
          console.log(`[cron/check-token-expiry] Already sent notification for ${key} on ${today}, skipping`);
          continue;
        }

        console.log(`[cron/check-token-expiry] Token ${key} expires today (${today}). Sending notifications to ${superAdmins.length} super admin(s).`);

        const successfulRecipients: string[] = [];

        // Send email to each super admin
        for (const admin of superAdmins) {
          try {
            const result = await sendTokenExpiryEmail({
              to: admin.email,
              name: admin.name,
              tokenType,
              expiryDate,
              dashboardUrl,
            });

            if (result.success) {
              successfulRecipients.push(admin.email);
            } else {
              console.error(`[cron/check-token-expiry] Failed to send email to ${admin.email}: ${result.error}`);
            }
          } catch (error) {
            console.error(`[cron/check-token-expiry] Error sending email to ${admin.email}:`, error);
          }
        }

        // Record that we sent the notification (prevent duplicate emails on the same day)
        if (successfulRecipients.length > 0) {
          await client.execute({
            sql: `INSERT INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
            args: [`TOKEN_EXPIRY_NOTIFIED:${key}:${today}`, successfulRecipients.join(',')],
          });
        }

        notificationsSent.push({
          tokenType: key,
          expiryDate,
          recipients: successfulRecipients,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: notificationsSent.length > 0
        ? `Sent ${notificationsSent.length} token expiry notification(s)`
        : 'No tokens expiring today',
      checkedAt: today,
      notificationsSent: notificationsSent.length,
      details: notificationsSent,
    });
  } catch (error) {
    console.error('[cron/check-token-expiry] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
