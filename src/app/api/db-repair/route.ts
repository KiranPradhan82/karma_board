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
  ProjectTodo: {
    reviewedBy: { type: "TEXT", default: null },
    reviewedAt: { type: "DATETIME", default: null },
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
  UserSession: `CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT
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
  ProjectTodo: `CREATE TABLE IF NOT EXISTS "ProjectTodo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
};

const INDEX_SQL: Record<string, string> = {
  ProjectTodo_projectId_sortOrder: `CREATE INDEX IF NOT EXISTS "ProjectTodo_projectId_sortOrder_idx" ON "ProjectTodo" ("projectId", "sortOrder")`,
  ProjectTodo_assigneeId: `CREATE INDEX IF NOT EXISTS "ProjectTodo_assigneeId_idx" ON "ProjectTodo" ("assigneeId")`,
  ProjectTodo_projectId_status: `CREATE INDEX IF NOT EXISTS "ProjectTodo_projectId_status_idx" ON "ProjectTodo" ("projectId", "status")`,
  ClientNotification_clientId: `CREATE INDEX IF NOT EXISTS "ClientNotification_clientId_idx" ON "ClientNotification" ("clientId")`,
  ClientNotification_projectId: `CREATE INDEX IF NOT EXISTS "ClientNotification_projectId_idx" ON "ClientNotification" ("projectId")`,
  ClientNotification_clientId_createdAt: `CREATE INDEX IF NOT EXISTS "ClientNotification_clientId_createdAt_idx" ON "ClientNotification" ("clientId", "createdAt" DESC)`,
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

  // 2.5. Create missing indexes
  for (const [indexName, indexSQL] of Object.entries(INDEX_SQL)) {
    try {
      await client.execute(indexSQL);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Failed to create index ${indexName}: ${msg}`);
    }
  }

  // 3. Add missing columns to existing tables
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
