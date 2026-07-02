import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{}>;
}

/**
 * Verify a 6-digit security code.
 * POST /api/security-code/verify
 * Body: { code: string, purpose?: string }
 */
export async function POST(req: NextRequest, _ctx: RouteContext) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const tursoClient = getTursoClient();
  const ip = getClientIp(req);

  try {
    const body = await req.json();
    const { code, purpose } = body as { code: string; purpose?: string };
    const codePurpose = purpose || "AI_CHAT";

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: "A valid 6-character code is required" },
        { status: 400 },
      );
    }

    const upperCode = code.toUpperCase();

    // Find the most recent unused, non-expired code for this user + purpose
    const result = await tursoClient.execute({
      sql: `SELECT id, code, "expiresAt" FROM "SecurityCode"
            WHERE "userId" = ? AND "purpose" = ? AND "usedAt" IS NULL
            ORDER BY "createdAt" DESC LIMIT 1`,
      args: [user.id, codePurpose],
    });

    if (result.rows.length === 0) {
      await logActivity({
        userId: user.id,
        action: "SECURITY_CODE_VERIFY_FAIL",
        details: "No active code found",
        entity: "SecurityCode",
        ipAddress: ip,
        tursoClient,
      });
      return NextResponse.json(
        { success: false, error: "No active security code found. Please request a new one." },
        { status: 400 },
      );
    }

    const row = result.rows[0];
    const storedCode = row.code as string;
    const expiresAt = new Date(row.expiresAt as string);

    if (Date.now() > expiresAt.getTime()) {
      // Mark expired
      await tursoClient.execute({
        sql: `UPDATE "SecurityCode" SET "usedAt" = datetime('now') WHERE id = ?`,
        args: [row.id as string],
      });
      await logActivity({
        userId: user.id,
        action: "SECURITY_CODE_VERIFY_FAIL",
        details: "Code expired",
        entity: "SecurityCode",
        entityId: row.id as string,
        ipAddress: ip,
        tursoClient,
      });
      return NextResponse.json(
        { success: false, error: "Security code has expired. Please request a new one." },
        { status: 400 },
      );
    }

    if (storedCode !== upperCode) {
      await logActivity({
        userId: user.id,
        action: "SECURITY_CODE_VERIFY_FAIL",
        details: `Wrong code entered: ${upperCode}`,
        entity: "SecurityCode",
        entityId: row.id as string,
        ipAddress: ip,
        tursoClient,
      });
      return NextResponse.json(
        { success: false, error: "Incorrect security code. Please try again." },
        { status: 400 },
      );
    }

    // Mark as used
    await tursoClient.execute({
      sql: `UPDATE "SecurityCode" SET "usedAt" = datetime('now') WHERE id = ?`,
      args: [row.id as string],
    });

    await logActivity({
      userId: user.id,
      action: "SECURITY_CODE_VERIFIED",
      details: `Purpose: ${codePurpose}`,
      entity: "SecurityCode",
      entityId: row.id as string,
      ipAddress: ip,
      tursoClient,
    });

    return NextResponse.json({ success: true, message: "Security code verified." });
  } catch (error) {
    console.error("[security-code] Error verifying code:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify security code" },
      { status: 500 },
    );
  }
}