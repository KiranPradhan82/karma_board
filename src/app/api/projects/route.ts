import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { createProjectSchema } from "@/lib/validations/project";

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

    // Get projects with member count and lead info
    const offset = (page - 1) * limit;
    const projectsResult = await client.execute({
      sql: `SELECT p.*,
              (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm."removedAt" IS NULL) as memberCount,
              (SELECT u.name FROM "ProjectMember" pm JOIN "User" u ON pm."userId" = u.id WHERE pm."projectId" = p.id AND pm.role = 'LEAD' AND pm."removedAt" IS NULL LIMIT 1) as leadName,
              (SELECT pm."userId" FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm.role = 'LEAD' AND pm."removedAt" IS NULL LIMIT 1) as leadId
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
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
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

    const { name, description, priority, clientName, color, deadline } = result.data;
    const client = getTursoClient();
    const ip = getClientIp(request);
    const id = crypto.randomUUID();

    await client.execute({
      sql: `INSERT INTO "Project" (id, "name", "description", "status", "priority", "clientName", "color", "deadline", "createdAt", "updatedAt")
            VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [id, name, description || null, priority, clientName || null, color || null, deadline || null],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: "CREATE_PROJECT",
      details: `Created project: ${name}`,
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
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
