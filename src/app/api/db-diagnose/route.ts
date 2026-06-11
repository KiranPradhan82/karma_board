import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

/**
 * GET /api/db-diagnose — Comprehensive database schema diagnostics.
 * Checks all tables, columns, and identifies mismatches with the Prisma schema.
 * Also tests multiple connection methods and provides detailed error info.
 */

// Expected schema based on prisma/schema.prisma
const EXPECTED_TABLES: Record<string, string[]> = {
  User: [
    "id", "name", "email", "password", "role", "avatar", "isActive",
    "jobTitle", "phone", "skills", "status", "mustChangePassword",
    "deletedAt", "joinDate", "lastLoginAt", "lastActivityAt", "createdAt", "updatedAt"
  ],
  Client: [
    "id", "name", "email", "password", "company", "address", "phone",
    "notes", "status", "mustChangePassword", "createdAt", "updatedAt"
  ],
  Project: [
    "id", "name", "description", "status", "priority", "clientName",
    "clientId", "color", "deadline", "createdAt", "updatedAt"
  ],
  ProjectMember: [
    "id", "projectId", "userId", "role", "joinedAt", "assignedBy", "removedAt"
  ],
  ActivityLog: [
    "id", "userId", "action", "details", "timestamp", "entity", "entityId", "ipAddress"
  ],
  AiChat: [
    "id", "userId", "projectId", "role", "content", "timestamp"
  ],
  AiProtocol: [
    "id", "name", "description", "isGlobal", "projectId", "createdAt", "updatedAt"
  ],
  AiProtocolStep: [
    "id", "protocolId", "title", "description", "commandTag", "stepOrder", "createdAt"
  ],
  ChatDeleteRequest: [
    "id", "projectId", "userId", "status", "reason", "reviewedBy", "reviewedAt", "createdAt", "updatedAt"
  ],
  ClientNotification: [
    "id", "clientId", "projectId", "type", "message", "sentBy", "createdAt"
  ],
  Invitation: [
    "id", "email", "projectId", "role", "token", "expiresAt", "accepted", "createdAt"
  ],
  ProjectDocument: [
    "id", "projectId", "docType", "title", "content", "pdfData", "version", "createdAt", "updatedAt"
  ],
  Settings: [
    "key", "value", "updatedAt"
  ],
  UserSession: [
    "id", "userId", "lastSeen", "ipAddress", "userAgent"
  ],
};

// Column definitions for auto-repair (ALTER TABLE ADD COLUMN)
const COLUMN_DEFS: Record<string, Record<string, { type: string; default: string | null }>> = {
  User: {
    status: { type: "TEXT", default: "'ACTIVE'" },
    deletedAt: { type: "DATETIME", default: null },
    joinDate: { type: "DATETIME", default: null },
    mustChangePassword: { type: "BOOLEAN", default: "0" },
    skills: { type: "TEXT", default: null },
    jobTitle: { type: "TEXT", default: null },
    phone: { type: "TEXT", default: null },
    avatar: { type: "TEXT", default: null },
    lastLoginAt: { type: "DATETIME", default: null },
    lastActivityAt: { type: "DATETIME", default: null },
  },
  Client: {
    status: { type: "TEXT", default: "'ACTIVE'" },
    mustChangePassword: { type: "BOOLEAN", default: "1" },
  },
  Project: {
    clientId: { type: "TEXT", default: null },
    color: { type: "TEXT", default: null },
  },
  ProjectMember: {
    removedAt: { type: "DATETIME", default: null },
    assignedBy: { type: "TEXT", default: null },
  },
};

export async function GET() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  const result: {
    connection: string;
    connectionTests: { method: string; url: string; success: boolean; error?: string; duration?: number }[];
    connectionDetails?: { type: string; url: string };
    envStatus: Record<string, string>;
    tables: {
      name: string;
      exists: boolean;
      missingColumns: string[];
      extraColumns: string[];
      allColumns: string[];
    }[];
    missingTables: string[];
    repairNeeded: boolean;
    repairSQL: string[];
    criticalIssues: string[];
    dataCounts: Record<string, number | string>;
  } = {
    connection: "NOT_ATTEMPTED",
    connectionTests: [],
    envStatus: {},
    tables: [],
    missingTables: [],
    repairNeeded: false,
    repairSQL: [],
    criticalIssues: [],
    dataCounts: {},
  };

  // Check env vars
  result.envStatus.TURSO_DATABASE_URL = tursoUrl
    ? `SET (starts: ${tursoUrl.substring(0, 30)}...)`
    : "NOT SET - will fall back to local file DB";
  result.envStatus.TURSO_AUTH_TOKEN = tursoToken
    ? `SET (${tursoToken.length} chars)`
    : "NOT SET - will fall back to local file DB";
  result.envStatus.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ? "SET" : "NOT SET";
  result.envStatus.NODE_ENV = process.env.NODE_ENV || "NOT SET";
  result.envStatus.VERCEL = process.env.VERCEL ? "YES (Region: " + (process.env.VERCEL_REGION || "unknown") + ")" : "NO (local)";

  if (!tursoUrl || !tursoToken) {
    result.connection = "NO_TURSO_CREDS";
    result.criticalIssues.push(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set. " +
      "App will use local file DB fallback which does not work on Vercel serverless."
    );
    return NextResponse.json(result);
  }

  const cleanUrl = tursoUrl.split("?")[0];

  result.connectionDetails = {
    type: "Turso (libsql)",
    url: cleanUrl,
  };

  // --- Connection Test 1: Standard libsql connection ---
  const start1 = Date.now();
  try {
    const client1 = createClient({ url: cleanUrl, authToken: tursoToken });
    await client1.execute("SELECT 1 as test");
    result.connectionTests.push({
      method: "libsql (standard)",
      url: cleanUrl,
      success: true,
      duration: Date.now() - start1,
    });
    result.connection = "OK";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    result.connectionTests.push({
      method: "libsql (standard)",
      url: cleanUrl,
      success: false,
      error: msg,
      duration: Date.now() - start1,
    });
    result.criticalIssues.push(`[libsql] Connection failed: ${msg}`);
    if (stack) {
      result.criticalIssues.push(`[libsql] Stack: ${stack.split('\n').slice(0, 3).join(' | ')}`);
    }
  }

  // --- Connection Test 2: HTTP-based (https://) connection ---
  // Turso supports connecting via https:// URL which uses the HTTP protocol
  const httpsUrl = cleanUrl.replace("libsql://", "https://");
  const start2 = Date.now();
  try {
    const client2 = createClient({ url: httpsUrl, authToken: tursoToken });
    await client2.execute("SELECT 1 as test");
    result.connectionTests.push({
      method: "libsql (https protocol)",
      url: httpsUrl.replace(tursoToken, "***"),
      success: true,
      duration: Date.now() - start2,
    });
    if (result.connection !== "OK") result.connection = "OK (via https)";
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.connectionTests.push({
      method: "libsql (https protocol)",
      url: httpsUrl,
      success: false,
      error: msg,
      duration: Date.now() - start2,
    });
  }

  // --- Connection Test 3: Raw HTTPS fetch to Turso gateway ---
  // This bypasses libsql entirely to test if the Turso server is reachable
  const start3 = Date.now();
  try {
    const response = await fetch(httpsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tursoToken}`,
      },
      body: JSON.stringify({
        statements: [{ q: "SELECT 1 as test" }],
      }),
    });
    const responseText = await response.text();
    result.connectionTests.push({
      method: "raw HTTPS POST to Turso gateway",
      url: httpsUrl,
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
      duration: Date.now() - start3,
    });
    if (response.ok && result.connection !== "OK" && result.connection !== "OK (via https)") {
      result.connection = "OK (raw HTTPS)";
    }
    if (!response.ok) {
      result.criticalIssues.push(`[raw HTTPS] Turso returned HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      // Parse Turso error for common issues
      if (response.status === 401) {
        result.criticalIssues.push("AUTH TOKEN INVALID: The TURSO_AUTH_TOKEN is rejected by Turso. Generate a new token from the Turso dashboard.");
      } else if (response.status === 404) {
        result.criticalIssues.push("DATABASE NOT FOUND: The database URL does not exist on Turso. Check the database name in your Turso dashboard.");
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.connectionTests.push({
      method: "raw HTTPS POST to Turso gateway",
      url: httpsUrl,
      success: false,
      error: msg,
      duration: Date.now() - start3,
    });
    result.criticalIssues.push(`[raw HTTPS] Network error: ${msg}`);
    result.criticalIssues.push(
      "This means the Vercel server CANNOT reach the Turso server at all. " +
      "Possible causes: (1) Database deleted from Turso, (2) Wrong URL, (3) Turso outage, (4) Vercel network restriction."
    );
  }

  // If no connection method worked, give clear guidance
  if (result.connection === "NOT_ATTEMPTED") {
    result.connection = "FAILED";
    result.criticalIssues.push(
      "ALL CONNECTION METHODS FAILED. Next steps:\n" +
      "1. Go to https://ui.turso.tech and verify the database 'karmaboarddb-kiran2057' EXISTS and is ACTIVE\n" +
      "2. Copy the EXACT URL shown in Turso dashboard (Settings > Connections)\n" +
      "3. Generate a NEW auth token (Settings > Authentication > Generate token)\n" +
      "4. Update BOTH TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel\n" +
      "5. Redeploy the app (env var changes need redeploy to take effect)"
    );
    return NextResponse.json(result);
  }

  // If connection works, proceed with schema check
  let client: ReturnType<typeof createClient> | null = null;
  try {
    // Use whichever method worked
    const test2 = result.connectionTests.find(t => t.method.includes("https protocol") && t.success);
    const test1 = result.connectionTests.find(t => t.method.includes("standard") && t.success);
    const test3 = result.connectionTests.find(t => t.method.includes("raw HTTPS") && t.success);

    if (test2) {
      client = createClient({ url: httpsUrl, authToken: tursoToken });
    } else if (test1) {
      client = createClient({ url: cleanUrl, authToken: tursoToken });
    } else if (!test3) {
      // None of the libsql methods worked
      return NextResponse.json(result);
    }
  } catch {
    return NextResponse.json(result);
  }

  if (!client) {
    // Only raw HTTPS worked, can't do schema check with that
    result.criticalIssues.push("Only raw HTTPS connection worked. Schema check not available via this method. The issue is likely with the libsql client version or configuration.");
    return NextResponse.json(result);
  }

  // Get all existing tables
  try {
    const existingTablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const existingTableNames = new Set(
      existingTablesResult.rows.map((r) => r.name as string)
    );

    // Check each expected table
    for (const [tableName, expectedCols] of Object.entries(EXPECTED_TABLES)) {
      const entry = {
        name: tableName,
        exists: existingTableNames.has(tableName),
        missingColumns: [] as string[],
        extraColumns: [] as string[],
        allColumns: [] as string[],
      };

      if (entry.exists) {
        const cols = await client.execute(`PRAGMA table_info("${tableName}")`);
        const actualCols = cols.rows.map((r) => r.name as string);
        entry.allColumns = actualCols;

        const expectedSet = new Set(expectedCols);
        const actualSet = new Set(actualCols);

        for (const col of expectedCols) {
          if (!actualSet.has(col)) {
            entry.missingColumns.push(col);
          }
        }
        for (const col of actualCols) {
          if (!expectedSet.has(col)) {
            entry.extraColumns.push(col);
          }
        }

        if (entry.missingColumns.length > 0) {
          result.repairNeeded = true;
          const defs = COLUMN_DEFS[tableName];
          for (const col of entry.missingColumns) {
            if (defs && defs[col]) {
              const def = defs[col];
              const defaultClause = def.default ? `DEFAULT ${def.default}` : "";
              result.repairSQL.push(
                `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${def.type} ${defaultClause};`
              );
            } else {
              result.criticalIssues.push(
                `Column "${col}" missing from "${tableName}" but no auto-repair definition available.`
              );
              result.repairSQL.push(
                `-- MANUAL FIX NEEDED: Add column "${col}" to "${tableName}"`
              );
            }
          }
        }
      } else {
        result.missingTables.push(tableName);
        result.repairNeeded = true;
        result.criticalIssues.push(
          `Table "${tableName}" does not exist in the database. `
        );
      }

      result.tables.push(entry);
    }

    // Get data counts for existing tables
    for (const tableName of existingTableNames) {
      try {
        const count = await client.execute(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
        result.dataCounts[tableName] = Number(count.rows[0].cnt);
      } catch {
        result.dataCounts[tableName] = "error";
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.criticalIssues.push(`Schema check failed: ${msg}`);
  }

  return NextResponse.json({
    ...result,
    timestamp: new Date().toISOString(),
  });
}
