import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { createProjectSchema } from "@/lib/validations/project";
import { hashPassword } from "@/lib/auth-utils";
import { sendClientWelcomeEmail } from "@/lib/email";
import { notifyClient } from "@/lib/notify-client";
import { notifyNewProject, notifyUsers } from "@/lib/notify";

// GET /api/projects — List all projects with search/filter/pagination
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const allowedSortFields = ["createdAt", "updatedAt", "name", "deadline", "priority"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "ASC" : "DESC";

    const client = getTursoClient();

    // Build WHERE clause
    const conditions: string[] = [];
    const args: unknown[] = [];

    // Non-SUPERADMIN users only see projects they are assigned to
    if (user.role !== "SUPERADMIN") {
      conditions.push(`p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)`);
      args.push(user.id);
    }

    if (search) {
      conditions.push(`(p."name" LIKE ? OR p."description" LIKE ? OR p."clientName" LIKE ?)`);
      const term = `%${search}%`;
      args.push(term, term, term);
    }

    if (status) {
      conditions.push(`p."status" = ?`);
      args.push(status);
    }

    if (priority) {
      conditions.push(`p."priority" = ?`);
      args.push(priority);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as total FROM "Project" p ${whereClause}`,
      args,
    });
    const total = Number(countResult.rows[0].total);

    // Get projects with member count, lead info, and client info
    const offset = (page - 1) * limit;
    const projectsResult = await client.execute({
      sql: `SELECT p.*,
              (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm."removedAt" IS NULL) as memberCount,
              (SELECT u.name FROM "ProjectMember" pm JOIN "User" u ON pm."userId" = u.id WHERE pm."projectId" = p.id AND pm.role = 'LEAD' AND pm."removedAt" IS NULL LIMIT 1) as leadName,
              (SELECT pm."userId" FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm.role = 'LEAD' AND pm."removedAt" IS NULL LIMIT 1) as leadId,
              (SELECT c.name FROM "Client" c WHERE c.id = p."clientId") as linkedClientName,
              (SELECT c.id FROM "Client" c WHERE c.id = p."clientId") as linkedClientId
            FROM "Project" p
            ${whereClause}
            ORDER BY p."${sortField}" ${order}
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    const projects = projectsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      clientName: row.clientName,
      clientId: row.clientId,
      linkedClientName: row.linkedClientName,
      linkedClientId: row.linkedClientId,
      color: row.color,
      deadline: row.deadline,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      memberCount: Number(row.memberCount),
      leadName: row.leadName,
      leadId: row.leadId,
    }));

    return NextResponse.json({
      success: true,
      data: {
        projects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/projects] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const isConnErr = /connect|fetch|network|timeout|turso|libsql|ENOTFOUND|ECONNREFUSED|database|TURSO/i.test(msg);
    return NextResponse.json({ success: false, error: isConnErr ? "Database connection failed. Please check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel." : `Internal server error: ${msg}` }, { status: 500 });
  }
}

// POST /api/projects — Create project (ADMIN+ only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Only ADMIN and SUPERADMIN can create projects
    const roleCheck = requireRole(["ADMIN", "SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const body = await request.json();
    const result = createProjectSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { name, description, priority, clientName, clientId, newClient, color, deadline } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);
    const id = crypto.randomUUID();

    let finalClientId = clientId || null;

    // Handle "new" clientId — create client inline
    if (clientId === "new" && newClient) {
      // Check for existing email
      const existing = await client.execute({
        sql: 'SELECT id FROM "Client" WHERE email = ?',
        args: [newClient.email],
      });
      if (existing.rows.length > 0) {
        // Link to existing client instead
        finalClientId = existing.rows[0].id as string;
      } else {
        // Generate temp password
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let tempPassword = '';
        for (let i = 0; i < 12; i++) {
          tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const hashedPassword = await hashPassword(tempPassword);
        const newClientId = crypto.randomUUID();
        const now = new Date().toISOString();

        try {
          await client.execute({
            sql: `INSERT INTO "Client" (id, name, email, password, company, address, phone, status, "mustChangePassword", createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
            args: [newClientId, newClient.name, newClient.email, hashedPassword, newClient.company || null, newClient.address || null, newClient.phone || null, now, now],
          });
        } catch (dbError: unknown) {
          const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
          if (dbMsg.includes('UNIQUE constraint failed')) {
            return NextResponse.json(
              { success: false, error: 'A client with this email already exists' },
              { status: 409 }
            );
          }
          throw dbError;
        }

        finalClientId = newClientId;

        // Send welcome email (non-blocking)
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://karma-board.vercel.app';
        try {
          await sendClientWelcomeEmail({
            to: newClient.email,
            name: newClient.name,
            temporaryPassword: tempPassword,
            loginUrl: `${baseUrl}/client/login`,
          });
        } catch (emailError) {
          console.error(`[POST /api/projects] Client welcome email error:`, emailError);
        }

        // Audit log for client creation
        await logActivity({
          userId: user.id,
          action: 'CREATE_CLIENT',
          details: `Created client inline: ${newClient.name} (${newClient.email})`,
          entity: 'client',
          entityId: newClientId,
          ipAddress: ip,
          tursoClient: client,
        });
      }
    }

    await client.execute({
      sql: `INSERT INTO "Project" (id, "name", "description", "status", "priority", "clientName", "clientId", "color", "deadline", "createdAt", "updatedAt")
            VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [id, name, description || null, priority, clientName || null, finalClientId, color || null, deadline || null],
    });

    // Auto-assign project creator as Team Leader
    const now = new Date().toISOString();
    const creatorExists = await client.execute({
      sql: 'SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ?',
      args: [id, user.id],
    });
    if (creatorExists.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt", "assignedBy")
              VALUES (?, ?, ?, 'LEAD', ?, ?)`,
        args: [crypto.randomUUID(), id, user.id, now, user.id],
      });
    } else {
      // Ensure creator has LEAD role even if somehow pre-existing
      await client.execute({
        sql: `UPDATE "ProjectMember" SET role = 'LEAD' WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
        args: [id, user.id],
      });
    }

    // Auto-assign all SUPERADMIN users as Team Leaders
    const superAdmins = await client.execute({
      sql: 'SELECT id FROM "User" WHERE role = ? AND "deletedAt" IS NULL',
      args: ["SUPERADMIN"],
    });
    for (const sa of superAdmins.rows) {
      const saId = sa.id as string;
      if (saId === user.id) continue; // Creator already added as LEAD above
      const saExists = await client.execute({
        sql: 'SELECT id, "removedAt" FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ?',
        args: [id, saId],
      });
      if (saExists.rows.length === 0) {
        await client.execute({
          sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt", "assignedBy")
                VALUES (?, ?, ?, 'LEAD', ?, ?)`,
          args: [crypto.randomUUID(), id, saId, now, user.id],
        });
      } else {
        // Re-activate and set as LEAD if previously removed
        await client.execute({
          sql: `UPDATE "ProjectMember" SET role = 'LEAD', "removedAt" = NULL WHERE "projectId" = ? AND "userId" = ?`,
          args: [id, saId],
        });
      }
    }

    // Send in-app notifications (fire-and-forget)
    // Notify each super admin about the new project (skip creator — they know)
    const notifyPromises: ReturnType<typeof notifyNewProject>[] = [];
    for (const sa of superAdmins.rows) {
      const saId = sa.id as string;
      if (saId !== user.id) {
        notifyPromises.push(
          notifyNewProject({
            userId: saId,
            projectName: name,
            projectId: id,
            role: "LEAD",
            creatorName: user.name || "Admin",
          })
        );
      }
    }
    if (notifyPromises.length > 0) {
      notifyUsers(notifyPromises);
    }

    // Notify client if project is linked to one
    if (finalClientId) {
      notifyClient({
        projectId: id,
        type: 'STARTED',
        message: `Project "${name}" has been created and assigned to you.`,
        sentBy: user.id,
      });
    }

    // Audit log
    await logActivity({
      userId: user.id,
      action: "CREATE_PROJECT",
      details: `Created project: ${name}${finalClientId ? ` (linked to client)` : ''}`,
      entity: "project",
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Fetch the created project
    const created = await client.execute({
      sql: `SELECT * FROM "Project" WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          project: {
            id,
            name,
            description,
            status: "ACTIVE",
            priority,
            clientName,
            clientId: finalClientId,
            color,
            deadline,
            createdAt: created.rows[0].createdAt,
            updatedAt: created.rows[0].updatedAt,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/projects] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const isConnErr = /connect|fetch|network|timeout|turso|libsql|ENOTFOUND|ECONNREFUSED|database|TURSO/i.test(msg);
    return NextResponse.json({ success: false, error: isConnErr ? "Database connection failed. Please check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel." : `Internal server error: ${msg}` }, { status: 500 });
  }
}
