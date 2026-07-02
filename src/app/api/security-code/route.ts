import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { sendSecurityCodeEmail } from "@/lib/email";

interface RouteContext {
  params: Promise<{}>;
}

/**
 * Generate a 6-digit alphanumeric security code, store it, and send via email.
 * POST /api/security-code
 * Body: { purpose?: string }  (default: "AI_CHAT")
 */
export async function POST(req: NextRequest, _ctx: RouteContext) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const tursoClient = getTursoClient();
  const ip = getClientIp(req);

  try {
    const body = await req.json().catch(() => ({}));
    const purpose = (body.purpose as string) || "AI_CHAT";

    // Generate 6-digit alphanumeric code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Create table if not exists
    await tursoClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS "SecurityCode" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "purpose" TEXT NOT NULL DEFAULT 'AI_CHAT',
        "expiresAt" DATETIME NOT NULL,
        "usedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      args: [],
    });
    await tursoClient.execute({
      sql: `CREATE INDEX IF NOT EXISTS "SecurityCode_userId_purpose_usedAt_idx" ON "SecurityCode"("userId", "purpose", "usedAt")`,
      args: [],
    });

    // Invalidate all previous unused codes for this user + purpose
    await tursoClient.execute({
      sql: `UPDATE "SecurityCode" SET "usedAt" = datetime('now') WHERE "userId" = ? AND "purpose" = ? AND "usedAt" IS NULL`,
      args: [user.id, purpose],
    });

    // Insert new code
    await tursoClient.execute({
      sql: `INSERT INTO "SecurityCode" (id, "userId", code, purpose, "expiresAt", "createdAt")
            VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [id, user.id, code, purpose, expiresAt.toISOString()],
    });

    // Send email with code
    try {
      await sendSecurityCodeEmail(user.email || "", code, user.name || "User");
    } catch (emailErr) {
      console.error("[security-code] Failed to send email, code will be shown inline:", emailErr);
      // Return the code directly if email fails so the user can still proceed
      return NextResponse.json({
        success: true,
        code, // fallback: show code in UI
        message: "Code generated. Email delivery failed — use the code shown below.",
        emailSent: false,
      });
    }

    await logActivity({
      userId: user.id,
      action: "SECURITY_CODE_GENERATED",
      details: `Purpose: ${purpose}`,
      entity: "SecurityCode",
      entityId: id,
      ipAddress: ip,
      tursoClient,
    });

    return NextResponse.json({
      success: true,
      message: "Security code sent to your email.",
      emailSent: true,
    });
  } catch (error) {
    console.error("[security-code] Error generating code:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate security code" },
      { status: 500 },
    );
  }
}