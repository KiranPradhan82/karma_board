import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";

// GET /api/notifications — List notifications for current user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const client = getTursoClient();

    const where = unreadOnly
      ? 'WHERE n."userId" = ? AND n."read" = 0'
      : 'WHERE n."userId" = ?';

    const result = await client.execute({
      sql: `SELECT n.*
            FROM "Notification" n
            ${where}
            ORDER BY n."createdAt" DESC
            LIMIT ?`,
      args: [user.id, limit],
    });

    // Count unread
    const unreadResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM "Notification" WHERE "userId" = ? AND "read" = 0',
      args: [user.id],
    });

    const notifications = result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      read: Boolean(row.read),
      createdAt: row.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount: Number(unreadResult.rows[0].count),
      },
    });
  } catch (error) {
    console.error("[GET /api/notifications] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/notifications — Mark notifications as read
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { action, notificationId } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: "Action is required" }, { status: 400 });
    }

    const client = getTursoClient();

    if (action === "mark_read" && notificationId) {
      // Mark single notification as read
      await client.execute({
        sql: 'UPDATE "Notification" SET "read" = 1 WHERE id = ? AND "userId" = ?',
        args: [notificationId, user.id],
      });
    } else if (action === "mark_all_read") {
      // Mark all notifications as read for current user
      await client.execute({
        sql: 'UPDATE "Notification" SET "read" = 1 WHERE "userId" = ? AND "read" = 0',
        args: [user.id],
      });
    } else {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    // Return updated unread count
    const unreadResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM "Notification" WHERE "userId" = ? AND "read" = 0',
      args: [user.id],
    });

    return NextResponse.json({
      success: true,
      data: { unreadCount: Number(unreadResult.rows[0].count) },
    });
  } catch (error) {
    console.error("[POST /api/notifications] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
