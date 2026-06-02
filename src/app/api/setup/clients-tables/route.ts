import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/api-auth';

// One-time setup: Creates Client and ClientNotification tables + clientId column on Project
// DELETE THIS ROUTE AFTER RUNNING
export async function POST() {
  try {
    const client = getTursoClient();

    // Test connection
    await client.execute({ sql: 'SELECT 1 as test', args: [] });

    // 1. Create Client table
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS "Client" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "company" TEXT,
          "address" TEXT,
          "phone" TEXT,
          "notes" TEXT,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "mustChangePassword" BOOLEAN NOT NULL DEFAULT 1,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, step: 'Client table', error: msg });
    }

    // 2. Create unique index on Client.email
    try {
      await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "Client_email_key" ON "Client"("email");`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, step: 'Client email index', error: msg });
    }

    // 3. Create ClientNotification table
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS "ClientNotification" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "clientId" TEXT NOT NULL,
          "projectId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "message" TEXT,
          "sentBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ClientNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "ClientNotification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, step: 'ClientNotification table', error: msg });
    }

    // 4. Add clientId column to Project
    try {
      await client.execute(`ALTER TABLE "Project" ADD COLUMN "clientId" TEXT;`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('duplicate column') || msg.includes('already exists')) {
        console.log('clientId column already exists on Project, skipping.');
      } else {
        return NextResponse.json({ success: false, step: 'Project.clientId column', error: msg });
      }
    }

    // Verify tables exist
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Client', 'ClientNotification') ORDER BY name"
    );
    const tableNames = tables.rows.map(r => r.name as string);

    return NextResponse.json({
      success: true,
      message: 'All Client tables created successfully',
      tablesCreated: tableNames,
    });
  } catch (error) {
    console.error('[setup/clients-tables] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
