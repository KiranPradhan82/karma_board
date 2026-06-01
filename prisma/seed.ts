import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

async function seed() {
  console.log("Seeding database...");

  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment");
    process.exit(1);
  }

  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });

  try {
    // Check if superadmin already exists
    const existing = await client.execute({
      sql: "SELECT id FROM User WHERE email = ?",
      args: ["admin@karmaboard.com"],
    });

    if (existing.rows.length > 0) {
      console.log("Superadmin already exists. Skipping seed.");
      return;
    }

    // Create superadmin
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const hashedPassword = await bcrypt.hash("Admin@123", 12);
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO "User" (id, name, email, password, role, "isActive", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, "Super Admin", "admin@karmaboard.com", hashedPassword, "SUPERADMIN", 1, now, now],
    });

    console.log("Superadmin created successfully!");
    console.log("Login: admin@karmaboard.com / Admin@123");

    // Verify
    const verify = await client.execute({
      sql: "SELECT id, name, email, role FROM User WHERE email = ?",
      args: ["admin@karmaboard.com"],
    });
    console.log("Verified:", verify.rows[0]);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
