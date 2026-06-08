import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient } from "@/lib/api-auth";

// GET /api/ai/chat/delete-requests — List pending delete requests (SUPERADMIN only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Only SUPERADMIN can view delete requests
    const roleCheck = requireRole(["SUPERADMIN"])(user);
    if (roleCheck) return roleCheck;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    const client = getTursoClient();

    let requests;
    if (status === "ALL") {
      requests = await client.execute({
        sql: `SELECT r.*,
              p.name as projectName,
              u.name as userName, u.email as userEmail
              FROM "ChatDeleteRequest" r
              JOIN "Project" p ON r."projectId" = p.id
              JOIN "User" u ON r."userId" = u.id
              ORDER BY r."createdAt" DESC
              LIMIT 50`,
        args: [],
      });
    } else {
      requests = await client.execute({
        sql: `SELECT r.*,
              p.name as projectName,
              u.name as userName, u.email as userEmail
              FROM "ChatDeleteRequest" r
              JOIN "Project" p ON r."projectId" = p.id
              JOIN "User" u ON r."userId" = u.id
              WHERE r.status = ?
              ORDER BY r."createdAt" DESC
              LIMIT 50`,
        args: [status],
      });
    }

    const deleteRequests = requests.rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      status: row.status,
      reason: row.reason,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return NextResponse.json({ success: true, data: { deleteRequests } });
  } catch (error) {
    console.error("[GET /api/ai/chat/delete-requests] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
