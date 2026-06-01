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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
      cause: error.cause
        ? error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack || null }
          : String(error.cause)
        : null,
    };
  }
  return { name: "UnknownError", message: String(error), stack: null, cause: null };
}

export async function GET() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const result = await client.execute(
        "SELECT id FROM User WHERE role = 'SUPERADMIN' LIMIT 1"
      );
      return NextResponse.json({
        setupRequired: result.rows.length === 0,
        _debug: {
          dbMode: "turso",
          tursoUrl: tursoUrl.replace(/authToken=[^&]+/, "authToken=***"),
          envCheck: {
            hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
            hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
            hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
            hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
          },
        },
      });
    } else {
      const superadmin = await db.user.findFirst({
        where: { role: "SUPERADMIN" },
      });
      return NextResponse.json({
        setupRequired: !superadmin,
        _debug: {
          dbMode: "local",
          envCheck: {
            hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
            hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
            hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
            hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
          },
        },
      });
    }
  } catch (error) {
    console.error("[Setup GET] Error:", error);
    return NextResponse.json({
      setupRequired: true,
      _error: serializeError(error),
      _debug: {
        dbMode: process.env.TURSO_DATABASE_URL ? "turso" : "local",
        envCheck: {
          hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
          hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
          hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
          hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        },
      },
    });
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
          _debug: { step: "validation", zodErrors: result.error.errors },
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
        "SELECT id FROM User WHERE role = 'SUPERADMIN' LIMIT 1"
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Setup already completed. Please sign in.",
            _debug: { step: "check-superadmin-exists", existingAdminId: existing.rows[0].id },
          },
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
          {
            success: false,
            error: "An account with this email already exists",
            _debug: { step: "check-email-exists" },
          },
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

      return NextResponse.json(
        {
          success: true,
          message: "Account created successfully. Please sign in.",
          _debug: {
            step: "user-created",
            dbMode: "turso",
            createdUserId: id,
            createdEmail: email,
            createdRole: "SUPERADMIN",
          },
        },
        { status: 201 }
      );
    } else {
      const existingAdmin = await db.user.findFirst({
        where: { role: "SUPERADMIN" },
      });
      if (existingAdmin) {
        return NextResponse.json(
          {
            success: false,
            error: "Setup already completed. Please sign in.",
            _debug: { step: "check-superadmin-exists", existingAdminId: existingAdmin.id },
          },
          { status: 409 }
        );
      }

      const hashedPassword = await hashPassword(password);
      const user = await db.user.create({
        data: { name, email, password: hashedPassword, role: "SUPERADMIN" },
      });

      return NextResponse.json(
        {
          success: true,
          message: "Account created successfully. Please sign in.",
          _debug: {
            step: "user-created",
            dbMode: "local-prisma",
            createdUserId: user.id,
            createdEmail: email,
            createdRole: "SUPERADMIN",
          },
        },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("[Setup POST] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Something went wrong. Please try again.",
        _error: serializeError(error),
        _debug: {
          step: "catch-all",
          dbMode: process.env.TURSO_DATABASE_URL ? "turso" : "local",
          timestamp: new Date().toISOString(),
          envCheck: {
            hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
            hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
            hasDatabaseUrl: !!process.env.DATABASE_URL,
            hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
            hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
          },
        },
      },
      { status: 500 }
    );
  }
}
