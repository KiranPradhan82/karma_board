import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/ai/chat/delete-requests/[id] — Approve or decline a delete request (SUPERADMIN only)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Only SUPERADMIN can approve/decline
    const roleCheck = requireRole(["SUPERADMIN"])(user);
    if (roleCheck) return roleCheck;

    const { id } = await context.params;
    const body = await request.json();
    const { action } = body; // "approve" or "decline"

    if (action !== "approve" && action !== "decline") {
      return NextResponse.json({ success: false, error: "Action must be 'approve' or 'decline'" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Fetch the delete request
    const requestResult = await client.execute({
      sql: `SELECT r.*, p.name as projectName, u.name as userName
            FROM "ChatDeleteRequest" r
            JOIN "Project" p ON r."projectId" = p.id
            JOIN "User" u ON r."userId" = u.id
            WHERE r.id = ?`,
      args: [id],
    });

    if (requestResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Delete request not found" }, { status: 404 });
    }

    const req = requestResult.rows[0];
    if (req.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `Request already ${req.status.toLowerCase()}` }, { status: 400 });
    }

    const newStatus = action === "approve" ? "APPROVED" : "DECLINED";
    const projectId = req.projectId as string;
    const requestorId = req.userId as string;
    const projectName = req.projectName as string;
    const requestorName = req.userName as string;

    if (action === "approve") {
      // === APPROVE: Delete all chat data for this project ===
      // Delete chat messages
      const chatResult = await client.execute({
        sql: `SELECT COUNT(*) as count FROM "AiChat" WHERE "projectId" = ?`,
        args: [projectId],
      });
      const deletedCount = Number(chatResult.rows[0].count);

      await client.execute({
        sql: `DELETE FROM "AiChat" WHERE "projectId" = ?`,
        args: [projectId],
      });

      // Delete project documents
      await client.execute({
        sql: `DELETE FROM "ProjectDocument" WHERE "projectId" = ?`,
        args: [projectId],
      });

      // Delete AI protocols for this project
      await client.execute({
        sql: `DELETE FROM "AiProtocolStep" WHERE "protocolId" IN (SELECT id FROM "AiProtocol" WHERE "projectId" = ?)`,
        args: [projectId],
      });
      await client.execute({
        sql: `DELETE FROM "AiProtocol" WHERE "projectId" = ?`,
        args: [projectId],
      });

      // Clear project theme from settings
      await client.execute({
        sql: `DELETE FROM "Settings" WHERE key = ?`,
        args: ["PROJECT_THEME:" + projectId],
      });

      // Update request status
      await client.execute({
        sql: `UPDATE "ChatDeleteRequest" SET status = ?, "reviewedBy" = ?, "reviewedAt" = datetime('now'), "updatedAt" = datetime('now') WHERE id = ?`,
        args: [newStatus, user.id, id],
      });

      // Audit logs
      await logActivity({
        userId: user.id,
        action: "CHAT_DELETE_APPROVED",
        details: `Approved chat deletion for project "${projectName}" (requested by ${requestorName}). Deleted ${deletedCount} messages, documents, and protocols.`,
        entity: "chat_delete_request",
        entityId: id,
        ipAddress: ip,
        tursoClient: client,
      });

      return NextResponse.json({
        success: true,
        data: {
          status: "APPROVED",
          deletedMessages: deletedCount,
          message: `Chat deleted successfully. ${deletedCount} messages removed from "${projectName}".`,
        },
      });
    } else {
      // === DECLINE: Just update the status ===
      await client.execute({
        sql: `UPDATE "ChatDeleteRequest" SET status = ?, "reviewedBy" = ?, "reviewedAt" = datetime('now'), "updatedAt" = datetime('now') WHERE id = ?`,
        args: [newStatus, user.id, id],
      });

      // Audit log
      await logActivity({
        userId: user.id,
        action: "CHAT_DELETE_DECLINED",
        details: `Declined chat deletion request for project "${projectName}" (requested by ${requestorName}).`,
        entity: "chat_delete_request",
        entityId: id,
        ipAddress: ip,
        tursoClient: client,
      });

      return NextResponse.json({
        success: true,
        data: {
          status: "DECLINED",
          message: `Delete request for "${projectName}" has been declined.`,
        },
      });
    }
  } catch (error) {
    console.error("[POST /api/ai/chat/delete-requests] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
