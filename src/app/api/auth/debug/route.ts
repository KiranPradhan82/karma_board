import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

/**
 * GET /api/auth/debug — Diagnostic endpoint for auth troubleshooting.
 * Tests Turso DB connection and reports env var status (no secrets exposed).
 * Should be removed in production.
 */
export async function GET() {
  const envChecks: Record<string, string> = {};

  // Check required env vars exist (don't expose values)
  envChecks.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL
    ? `SET (${process.env.TURSO_DATABASE_URL.length} chars, starts with: ${process.env.TURSO_DATABASE_URL.substring(0, 15)}...)`
    : "NOT SET";
  envChecks.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN
    ? `SET (${process.env.TURSO_AUTH_TOKEN.length} chars)`
    : "NOT SET";
  envChecks.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
    ? `SET (${process.env.NEXTAUTH_SECRET.length} chars)`
    : "NOT SET";
  envChecks.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "NOT SET (will auto-detect from request)";
  envChecks.RESEND_API_KEY = process.env.RESEND_API_KEY
    ? `SET (${process.env.RESEND_API_KEY.length} chars)`
    : "NOT SET";
  envChecks.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "NOT SET";
  envChecks.EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "NOT SET";
  envChecks.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "NOT SET (defaults to gmail-smtp)";
  envChecks.SMTP_USER = process.env.SMTP_USER || "NOT SET";
  envChecks.SMTP_PASSWORD = process.env.SMTP_PASSWORD
    ? `SET (${process.env.SMTP_PASSWORD.length} chars)`
    : "NOT SET";
  envChecks.NODE_ENV = process.env.NODE_ENV || "NOT SET";

  let dbTest = "NOT ATTEMPTED";
  let dbError: string | null = null;
  let userCount = null;
  let tablesResult: string[] = [];

  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const cleanUrl = tursoUrl.split("?")[0];
      const client = createClient({ url: cleanUrl, authToken: tursoToken });

      // Test basic connection
      try {
        await client.execute("SELECT 1 as test");
        dbTest = "CONNECTION OK";
      } catch (e: unknown) {
        dbTest = "CONNECTION FAILED";
        dbError = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ envChecks, dbTest, dbError });
      }

      // Check tables exist
      try {
        const tables = await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        tablesResult = tables.rows.map((r) => r.name as string);
      } catch (e: unknown) {
        tablesResult = ["Error: " + (e instanceof Error ? e.message : String(e))];
      }

      // Count users
      try {
        const users = await client.execute("SELECT COUNT(*) as cnt FROM User");
        userCount = Number(users.rows[0].cnt);
      } catch (e: unknown) {
        userCount = "Error: " + (e instanceof Error ? e.message : String(e));
      }

      // Check if mustChangePassword column exists
      try {
        const cols = await client.execute("PRAGMA table_info(User)");
        const columnNames = cols.rows.map((r) => r.name as string);
        tablesResult.push("User columns: " + columnNames.join(", "));
      } catch {
        // ignore
      }
    } else {
      dbTest = "SKIPPED (no Turso URL/token)";
    }
  } catch (e: unknown) {
    dbTest = "EXCEPTION";
    dbError = e instanceof Error ? e.message + "\n" + e.stack : String(e);
  }

  return NextResponse.json({
    envChecks,
    dbTest,
    dbError,
    tablesResult,
    userCount,
    timestamp: new Date().toISOString(),
  });
}
