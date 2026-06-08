import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { verifyPassword } from "@/lib/auth-utils";
import { sendChatDeleteRequestEmail } from "@/lib/email";

export const maxDuration = 30;

// POST /api/ai/chat/delete-request — User requests chat deletion (password verified)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, password } = body;

    if (!projectId || !password) {
      return NextResponse.json({ success: false, error: "projectId and password are required" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Verify user's current password
    const userResult = await client.execute({
      sql: `SELECT password FROM "User" WHERE id = ?`,
      args: [user.id],
    });
    if (userResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const currentHash = userResult.rows[0].password as string;
    const isPasswordValid = await verifyPassword(password, currentHash);
    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 });
    }

    // Check if there's already a pending request for this project
    const existingRequest = await client.execute({
      sql: `SELECT id, status FROM "ChatDeleteRequest" WHERE "projectId" = ? AND "userId" = ? AND status = 'PENDING'`,
      args: [projectId, user.id],
    });
    if (existingRequest.rows.length > 0) {
      return NextResponse.json({
        success: false,
        error: "A delete request is already pending for this project. Please wait for the super admin to review it.",
      }, { status: 409 });
    }

    // Get project name for the request
    const projectResult = await client.execute({
      sql: `SELECT name FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    const projectName = projectResult.rows.length > 0 ? (projectResult.rows[0].name as string) : "Unknown";

    // Check if there are any chat messages to delete
    const chatCount = await client.execute({
      sql: `SELECT COUNT(*) as count FROM "AiChat" WHERE "projectId" = ?`,
      args: [projectId],
    });
    const messageCount = Number(chatCount.rows[0].count);
    if (messageCount === 0) {
      return NextResponse.json({ success: false, error: "No chat messages to delete for this project." }, { status: 400 });
    }

    // Create the delete request
    const requestId = crypto.randomUUID();
    await client.execute({
      sql: `INSERT INTO "ChatDeleteRequest" (id, "projectId", "userId", status, "createdAt", "updatedAt")
            VALUES (?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`,
      args: [requestId, projectId, user.id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: "CHAT_DELETE_REQUESTED",
      details: `Requested chat deletion for project "${projectName}" (${messageCount} messages). Awaiting super admin approval.`,
      entity: "chat_delete_request",
      entityId: requestId,
      ipAddress: ip,
      tursoClient: client,
    });

    // Notify all SUPERADMIN users via email (fire-and-forget)
    try {
      const dashboardUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "";
      const adminsResult = await client.execute({
        sql: `SELECT name, email FROM "User" WHERE role = 'SUPERADMIN' AND "isActive" = 1 AND "deletedAt" IS NULL`,
        args: [],
      });
      for (const admin of adminsResult.rows) {
        sendChatDeleteRequestEmail({
          to: admin.email as string,
          adminName: admin.name as string,
          requestorName: user.name || user.email,
          requestorEmail: user.email,
          projectName,
          dashboardUrl,
        }).catch((err) => console.warn("[delete-request] Failed to send admin notification:", err));
      }
    } catch (err) {
      console.warn("[delete-request] Failed to fetch admins for notification:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: requestId,
        status: "PENDING",
        message: "Delete request submitted. A super admin will review your request.",
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/chat/delete-request] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
