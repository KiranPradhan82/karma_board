import { getTursoClient } from '@/lib/api-auth';
import { sendClientNotificationEmail } from '@/lib/email';

/**
 * Notify a linked client about a project event.
 * Inserts a ClientNotification row and sends an email (both fire-and-forget).
 *
 * Usage:
 *   await notifyClient({ projectId, type: 'STARTED', message: 'Project started', sentBy: user.id });
 */
export async function notifyClient(params: {
  projectId: string;
  type: 'STARTED' | 'UPDATE' | 'COMPLETED';
  message: string;
  sentBy: string;
}): Promise<void> {
  const { projectId, type, message, sentBy } = params;

  try {
    const client = getTursoClient();

    // Fetch client info + project name in one query
    const result = await client.execute({
      sql: `SELECT c.id as "clientId", c.name as "clientName", c.email as "clientEmail",
                   p.name as "projectName"
            FROM "Project" p
            LEFT JOIN "Client" c ON c.id = p."clientId"
            WHERE p.id = ?`,
      args: [projectId],
    });

    const row = result.rows[0];
    if (!row?.clientId) return; // No linked client

    const clientId = row.clientId as string;
    const clientName = row.clientName as string;
    const clientEmail = row.clientEmail as string;
    const projectName = row.projectName as string;

    // Insert in-app notification
    await client.execute({
      sql: `INSERT INTO "ClientNotification" (id, "clientId", "projectId", type, message, "sentBy", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [crypto.randomUUID(), clientId, projectId, type, message, sentBy],
    });

    // Send email (fire-and-forget, non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://karma-board.vercel.app';
    sendClientNotificationEmail({
      to: clientEmail,
      clientName,
      projectName,
      type,
      message,
      loginUrl: `${baseUrl}/client/login`,
    }).catch((err) => {
      console.error(`[notifyClient] Email failed for ${clientEmail}:`, err);
    });
  } catch (err) {
    // Non-critical — never block the main operation
    console.error('[notifyClient] Error:', err);
  }
}