import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET /api/ai/analytics — AI usage statistics (ADMIN+ only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!["SUPERADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Ensure table exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "AiChat" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        "timestamp" TEXT NOT NULL
      )
    `);

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "30d"; // 7d, 30d, 90d, all

    // Calculate date filter
    let dateFilter = "";
    if (period !== "all") {
      const days = parseInt(period) || 30;
      dateFilter = ` AND "timestamp" >= datetime('now', '-${days} days')`;
    }

    // 1. Total messages & by role
    const totalResult = await client.execute(`
      SELECT role, COUNT(*) as count FROM "AiChat"
      WHERE 1=1${dateFilter}
      GROUP BY role
    `);
    const totalByRole: Record<string, number> = {};
    let totalMessages = 0;
    for (const row of totalResult.rows) {
      const count = Number(row.count);
      totalByRole[row.role as string] = count;
      totalMessages += count;
    }

    // 2. Messages per project
    const projectResult = await client.execute(`
      SELECT p.name, p.id, COUNT(*) as count
      FROM "AiChat" a
      JOIN "Project" p ON a."projectId" = p.id
      WHERE 1=1${dateFilter}
      GROUP BY a."projectId"
      ORDER BY count DESC
      LIMIT 20
    `);

    // 3. Active users
    const userResult = await client.execute(`
      SELECT u.name, u.email, u.role, COUNT(*) as messages
      FROM "AiChat" a
      JOIN "User" u ON a."userId" = u.id
      WHERE 1=1${dateFilter}
      GROUP BY a."userId"
      ORDER BY messages DESC
      LIMIT 20
    `);

    // 4. Daily message volume (last 30 days)
    const dailyResult = await client.execute(`
      SELECT date("timestamp") as day, COUNT(*) as count
      FROM "AiChat"
      WHERE 1=1${dateFilter} AND role = 'user'
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `);

    // 5. Command usage (detect /commands from user messages)
    const commandResult = await client.execute(`
      SELECT
        CASE
          WHEN content LIKE '/docs%' THEN '/docs'
          WHEN content LIKE '/prd%' THEN '/prd'
          WHEN content LIKE '/trd%' THEN '/trd'
          WHEN content LIKE '/flow%' THEN '/flow'
          WHEN content LIKE '/ux%' THEN '/ux'
          WHEN content LIKE '/schema%' THEN '/schema'
          WHEN content LIKE '/plan%' THEN '/plan'
          WHEN content LIKE '/init%' THEN '/init'
          WHEN content LIKE '/standup%' THEN '/standup'
          WHEN content LIKE '/risks%' THEN '/risks'
          WHEN content LIKE '/summarize%' THEN '/summarize'
          WHEN content LIKE '/code-review%' THEN '/code-review'
          WHEN content LIKE '/knowledge%' THEN '/knowledge'
          WHEN content LIKE '/help%' THEN '/help'
          ELSE 'freeform'
        END as command_type,
        COUNT(*) as count
      FROM "AiChat"
      WHERE role = 'user'${dateFilter}
      GROUP BY command_type
      ORDER BY count DESC
    `);

    // 6. Average response length (assistant messages)
    const avgResult = await client.execute(`
      SELECT AVG(length(content)) as avg_len, COUNT(*) as count
      FROM "AiChat"
      WHERE role = 'assistant'${dateFilter}
    `);

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalMessages,
        userMessages: totalByRole["user"] || 0,
        assistantMessages: totalByRole["assistant"] || 0,
        avgResponseLength: avgResult.rows[0] ? Math.round(Number(avgResult.rows[0].avg_len)) : 0,
        projects: projectResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          messages: Number(r.count),
        })),
        users: userResult.rows.map((r) => ({
          name: r.name,
          email: r.email,
          role: r.role,
          messages: Number(r.messages),
        })),
        dailyVolume: dailyResult.rows.reverse().map((r) => ({
          day: r.day,
          messages: Number(r.count),
        })),
        commandUsage: commandResult.rows.map((r) => ({
          command: r.command_type,
          count: Number(r.count),
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/analytics]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}