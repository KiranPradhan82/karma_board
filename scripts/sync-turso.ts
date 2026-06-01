import { createClient } from '@libsql/client';

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "avatar" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ProjectMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TimeLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "clockIn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clockOut" DATETIME,
  "duration" INTEGER,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TimeLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Invitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "projectId" TEXT,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "token" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "accepted" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AiChat" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiChat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");
`;

// ALTER TABLE statements for new columns — safe to run multiple times via try/catch
const ALTER_TABLE_SQL = `
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "skills" TEXT;
ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "joinDate" DATETIME;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "ProjectMember" ADD COLUMN "assignedBy" TEXT;
ALTER TABLE "ProjectMember" ADD COLUMN "removedAt" DATETIME;
ALTER TABLE "ActivityLog" ADD COLUMN "entity" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "entityId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "ipAddress" TEXT;
`;

async function syncSchema() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.log('No Turso credentials found (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Skipping Turso sync.');
    console.log('Local schema is already in sync via prisma db push.');
    return;
  }

  console.log('Connecting to Turso...');

  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });

  try {
    const result = await client.execute('SELECT 1 as test');
    console.log('Connected to Turso. Test query returned:', result.rows[0]);

    const statements = SCHEMA_SQL.split(';').filter(s => s.trim());

    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await client.execute(stmt.trim());
          console.log('Executed statement successfully');
        } catch (err) {
          console.error('Error executing statement:', err);
        }
      }
    }

    // Run ALTER TABLE statements (skip if column already exists)
    const alterStatements = ALTER_TABLE_SQL.split(';').filter(s => s.trim());
    console.log('\nRunning ALTER TABLE migrations...');
    for (const stmt of alterStatements) {
      if (stmt.trim()) {
        try {
          await client.execute(stmt.trim());
          console.log('Migration applied successfully');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('duplicate column') || msg.includes('already exists')) {
            console.log('Column already exists, skipping:', stmt.trim().substring(0, 80));
          } else {
            console.error('Error executing migration:', msg);
          }
        }
      }
    }

    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    console.log('\nTables in Turso:');
    for (const row of tables.rows) {
      console.log(`  - ${row.name}`);
    }

    console.log('\nSchema sync to Turso completed successfully!');
  } catch (error) {
    console.error('Failed to sync schema:', error);
    process.exit(1);
  }
}

syncSchema();
