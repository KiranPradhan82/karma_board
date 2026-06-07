import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

/**
 * GET /api/db-diagnose — Comprehensive database schema diagnostics.
 * Checks all tables, columns, and identifies mismatches with the Prisma schema.
 * Returns actionable error messages and repair SQL if needed.
 */

// Expected schema based on prisma/schema.prisma
const EXPECTED_TABLES: Record<string, string[]> = {
  User: [
    "id", "name", "email", "password", "role", "avatar", "isActive",
    "jobTitle", "phone", "skills", "status", "mustChangePassword",
    "deletedAt", "joinDate", "createdAt", "updatedAt"
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
  TimeLog: [
    "id", "userId", "projectId", "clockIn", "clockOut", "duration", "notes", "createdAt"
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
    ? `SET (starts: ${tursoUrl.substring(0, 20)}...)`
    : "NOT SET - will fall back to local file DB";
  result.envStatus.TURSO_AUTH_TOKEN = tursoToken
    ? `SET (${tursoToken.length} chars)`
    : "NOT SET - will fall back to local file DB";
  result.envStatus.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ? "SET" : "NOT SET";

  if (!tursoUrl || !tursoToken) {
    result.connection = "NO_TURSO_CREDS";
    result.criticalIssues.push(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set. " +
      "App will use local file DB fallback which doesn't work on Vercel serverless."
    );
    return NextResponse.json(result);
  }

  const cleanUrl = tursoUrl.split("?")[0];
  const client = createClient({ url: cleanUrl, authToken: tursoToken });

  result.connectionDetails = {
    type: "Turso (libsql)",
    url: cleanUrl.replace(/\/\/.*:/, "//***:"),
  };

  // Test connection
  try {
    await client.execute("SELECT 1 as test");
    result.connection = "OK";
  } catch (e: unknown) {
    result.connection = "FAILED";
    const msg = e instanceof Error ? e.message : String(e);
    result.criticalIssues.push(`Database connection failed: ${msg}`);
    return NextResponse.json(result);
  }

  // Get all existing tables
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
      // Get actual columns
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
        // Generate repair SQL
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
        `Table "${tableName}" does not exist in the database. ` +
        `This table is required for the app to function.`
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

  return NextResponse.json({
    ...result,
    timestamp: new Date().toISOString(),
  });
}
