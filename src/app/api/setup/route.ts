import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth-utils";
import { createClient } from "@libsql/client";

const setupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Za-z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
  });

export async function GET() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const result = await client.execute(
        'SELECT id FROM User WHERE role = "SUPERADMIN" LIMIT 1'
      );
      return NextResponse.json({ setupRequired: result.rows.length === 0 });
    } else {
      const superadmin = await db.user.findFirst({
        where: { role: "SUPERADMIN" },
      });
      return NextResponse.json({ setupRequired: !superadmin });
    }
  } catch (error) {
    console.error("[Setup GET] Error:", error);
    return NextResponse.json({ setupRequired: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = setupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error.errors[0]?.message || "Invalid input",
        },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });

      // Check if superadmin already exists
      const existing = await client.execute(
        'SELECT id FROM User WHERE role = "SUPERADMIN" LIMIT 1'
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: "Setup already completed. Please sign in." },
          { status: 409 }
        );
      }

      // Check if email is already taken
      const emailExists = await client.execute({
        sql: "SELECT id FROM User WHERE email = ?",
        args: [email],
      });
      if (emailExists.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: "An account with this email already exists" },
          { status: 409 }
        );
      }

      // Create superadmin
      const id = crypto.randomUUID();
      const hashedPassword = await hashPassword(password);
      const now = new Date().toISOString();

      await client.execute({
        sql: `INSERT INTO "User" (id, name, email, password, role, "isActive", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, name, email, hashedPassword, "SUPERADMIN", 1, now, now],
      });
    } else {
      const existingAdmin = await db.user.findFirst({
        where: { role: "SUPERADMIN" },
      });
      if (existingAdmin) {
        return NextResponse.json(
          { success: false, error: "Setup already completed. Please sign in." },
          { status: 409 }
        );
      }

      const hashedPassword = await hashPassword(password);
      await db.user.create({
        data: { name, email, password: hashedPassword, role: "SUPERADMIN" },
      });
    }

    return NextResponse.json(
      { success: true, message: "Account created successfully. Please sign in." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Setup POST] Error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
