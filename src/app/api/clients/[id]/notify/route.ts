import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from '@/lib/api-auth';
import { notifyClientSchema } from '@/lib/validations/client';
import { sendClientNotificationEmail } from '@/lib/email';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/clients/[id]/notify — Send notification to client (SUPERADMIN only)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const roleCheck = requireRole(['SUPERADMIN', 'ADMIN'])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const body = await request.json();
    const result = notifyClientSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { projectId, type, message } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check client exists
    const clientResult = await client.execute({
      sql: 'SELECT id, name, email FROM "Client" WHERE id = ?',
      args: [id],
    });
    if (clientResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const clientData = clientResult.rows[0];

    // Check project exists
    const projectResult = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [projectId],
    });
    if (projectResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const projectName = projectResult.rows[0].name as string;

    // Save notification to ClientNotification table
    const notificationId = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO "ClientNotification" (id, "clientId", "projectId", type, message, "sentBy", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [notificationId, id, projectId, type, message || null, user.id, now],
    });

    // Send email notification
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://karma-board.vercel.app';
    let emailResult: { success: boolean; error?: string } = { success: false, error: 'Email not attempted' };
    try {
      emailResult = await sendClientNotificationEmail({
        to: clientData.email as string,
        clientName: clientData.name as string,
        projectName,
        type,
        message,
        loginUrl: `${baseUrl}/client/portal`,
      });
    } catch (emailError) {
      const msg = emailError instanceof Error ? emailError.message : String(emailError);
      console.error(`[POST /api/clients/[id]/notify] Email error: ${msg}`);
      emailResult = { success: false, error: msg };
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: 'NOTIFY_CLIENT',
      details: `Sent ${type} notification to client ${clientData.name} (${clientData.email}) about project "${projectName}". Email sent: ${emailResult.success}`,
      entity: 'client',
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Also log activity visible to client
    await logActivity({
      userId: user.id,
      action: `PROJECT_${type}`,
      details: `Project "${projectName}" ${type.toLowerCase()}. ${message || ''}`,
      entity: 'project',
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        notificationId,
        emailSent: emailResult.success,
        emailError: emailResult.error || null,
      },
    });
  } catch (error) {
    console.error('[POST /api/clients/[id]/notify] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
