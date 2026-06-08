import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

/**
 * POST /api/db-repair — Auto-repair database schema.
 * Adds missing columns and reports results.
 * Should only be called after /api/db-diagnose confirms repair is needed.
 */

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

// Table creation SQL for missing tables (simplified — full CREATE TABLE statements)
const TABLE_CREATE_SQL: Record<string, string> = {
  Settings: `CREATE TABLE IF NOT EXISTS "Settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  Invitation: `CREATE TABLE IF NOT EXISTS "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "projectId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" DATETIME NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  ClientNotification: `CREATE TABLE IF NOT EXISTS "ClientNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "sentBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  AiProtocol: `CREATE TABLE IF NOT EXISTS "AiProtocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  AiProtocolStep: `CREATE TABLE IF NOT EXISTS "AiProtocolStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "commandTag" TEXT,
    "stepOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  ChatDeleteRequest: `CREATE TABLE IF NOT EXISTS "ChatDeleteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  ProjectDocument: `CREATE TABLE IF NOT EXISTS "ProjectDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pdfData" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    UNIQUE("projectId", "docType")
  )`,
  TimeLog: `CREATE TABLE IF NOT EXISTS "TimeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clockIn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOut" DATETIME,
    "duration" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  ActivityLog: `CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entity" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT
  )`,
};

export async function POST() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    return NextResponse.json(
      {
        success: false,
        error:
          "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set. Cannot repair.",
      },
      { status: 400 }
    );
  }

  const cleanUrl = tursoUrl.split("?")[0];
  const client = createClient({ url: cleanUrl, authToken: tursoToken });

  const results: {
    tablesRepaired: { table: string; column: string; sql: string }[];
    tablesCreated: { table: string; sql: string }[];
    errors: string[];
  } = {
    tablesRepaired: [],
    tablesCreated: [],
    errors: [],
  };

  // 1. Create missing tables
  for (const [tableName, createSQL] of Object.entries(TABLE_CREATE_SQL)) {
    try {
      // Check if table exists
      const check = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      if (check.rows.length === 0) {
        await client.execute(createSQL);
        results.tablesCreated.push({ table: tableName, sql: createSQL });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Failed to create table ${tableName}: ${msg}`);
    }
  }

  // 2. Add missing columns to existing tables
  for (const [tableName, columns] of Object.entries(COLUMN_DEFS)) {
    // Check if table exists
    try {
      const check = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      if (check.rows.length === 0) continue;

      // Get existing columns
      const cols = await client.execute(`PRAGMA table_info("${tableName}")`);
      const existingCols = new Set(cols.rows.map((r) => r.name as string));

      for (const [colName, def] of Object.entries(columns)) {
        if (!existingCols.has(colName)) {
          try {
            const defaultClause = def.default
              ? `DEFAULT ${def.default}`
              : "";
            const sql = `ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${def.type} ${defaultClause}`;
            await client.execute(sql);
            results.tablesRepaired.push({
              table: tableName,
              column: colName,
              sql,
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            results.errors.push(
              `Failed to add ${tableName}.${colName}: ${msg}`
            );
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Failed to process table ${tableName}: ${msg}`);
    }
  }

  return NextResponse.json({
    success: results.errors.length === 0,
    repairsApplied: results.tablesRepaired.length,
    tablesCreated: results.tablesCreated.length,
    tablesRepaired: results.tablesRepaired,
    tablesCreatedDetails: results.tablesCreated,
    errors: results.errors,
    timestamp: new Date().toISOString(),
  });
}
