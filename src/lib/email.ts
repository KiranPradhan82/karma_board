import type { Resend as ResendType } from 'resend';
import { decrypt } from '@/lib/encryption';
import { getTursoClient } from '@/lib/api-auth';

interface EmailConfig {
  apiKey: string | null;
  fromEmail: string;
  fromName: string;
}

/**
 * Get email configuration — reads from Settings DB first, falls back to env vars.
 * API key is decrypted if stored in DB.
 */
async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const client = getTursoClient();
      const result = await client.execute({
        sql: 'SELECT key, value FROM "Settings" WHERE key IN (?, ?, ?)',
        args: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_FROM_NAME'],
      });

      let apiKey: string | null = null;
      let fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@karmaboard.com';
      let fromName = process.env.RESEND_FROM_NAME || 'KarmaBoard';

      for (const row of result.rows) {
        const key = row.key as string;
        const rawValue = row.value as string;

        if (key === 'RESEND_API_KEY') {
          try {
            apiKey = decrypt(rawValue);
          } catch {
            console.error('[email] Failed to decrypt API key from DB');
            apiKey = null;
          }
        } else if (key === 'RESEND_FROM_EMAIL') {
          fromEmail = rawValue || fromEmail;
        } else if (key === 'RESEND_FROM_NAME') {
          fromName = rawValue || fromName;
        }
      }

      // Fall back to env var if DB doesn't have API key
      if (!apiKey && process.env.RESEND_API_KEY) {
        apiKey = process.env.RESEND_API_KEY;
      }

      return { apiKey, fromEmail, fromName };
    }
  } catch (error) {
    console.error('[email] Error reading settings from DB:', error);
  }

  // Final fallback to env vars only
  return {
    apiKey: process.env.RESEND_API_KEY || null,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@karmaboard.com',
    fromName: process.env.RESEND_FROM_NAME || 'KarmaBoard',
  };
}

/**
 * Lazily create the Resend client.
 */
async function getResendClient(apiKey: string): Promise<ResendType> {
  const { Resend } = await import('resend');
  return new Resend(apiKey);
}

/**
 * Send a welcome email with temporary password to a new team member.
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, name, temporaryPassword, loginUrl } = params;

  const config = await getEmailConfig();

  if (!config.apiKey) {
    console.warn('[email] No Resend API key configured — skipping email send. Member was still created.');
    console.warn(`[email] Would have sent to: ${to}`);
    console.warn(`[email] Temporary password: ${temporaryPassword}`);
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = await getResendClient(config.apiKey);

    const { data, error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [to],
      subject: `Welcome to KarmaBoard, ${name}! — Your Account is Ready`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #6366f1; margin-bottom: 16px;">
              <span style="color: #ffffff; font-size: 24px; font-weight: 700;">K</span>
            </div>
            <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">Welcome to KarmaBoard!</h1>
          </div>

          <!-- Greeting -->
          <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>${name}</strong>,
          </p>

          <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
            Your account has been created and you're now part of the team! You can log in to KarmaBoard to start managing projects and collaborating with your team.
          </p>

          <!-- Credentials Card -->
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 16px 0;">Your Login Credentials</p>

            <div style="margin-bottom: 16px;">
              <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Email</p>
              <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${to}</p>
            </div>

            <div>
              <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Temporary Password</p>
              <p style="font-size: 15px; color: #111827; margin: 0; font-family: monospace; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; letter-spacing: 0.5px;">${temporaryPassword}</p>
            </div>
          </div>

          <!-- Security Notice -->
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
              <strong>Important:</strong> You will be asked to set your own password the first time you log in. This temporary password will expire after you change it.
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${loginUrl}" target="_blank" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
              Log In to KarmaBoard
            </a>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
            <p style="font-size: 13px; color: #9ca3af; margin: 0 0 4px 0;">
              If you did not expect this email, please contact your administrator.
            </p>
            <p style="font-size: 13px; color: #9ca3af; margin: 0;">
              KarmaBoard — Project Management Made Simple
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('[email] Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[email] Welcome email sent to ${to}, emailId: ${data?.id}`);
    return { success: true };
  } catch (error) {
    console.error('[email] Failed to send welcome email:', error);
    return { success: false, error: 'Failed to send email' };
  }
}
