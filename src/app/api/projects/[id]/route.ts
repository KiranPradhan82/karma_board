import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { updateProjectSchema } from "@/lib/validations/project";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] — Get project detail
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();

    const project = await client.execute({
      sql: `SELECT p.*,
              (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm."removedAt" IS NULL) as memberCount
            FROM "Project" p
            WHERE p.id = ?`,
      args: [id],
    });

    if (project.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const row = project.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        project: {
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
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/projects/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/projects/[id] — Update project (ADMIN+ only, SUPERADMIN has full control)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["ADMIN", "SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check project exists
    const existing = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateProjectSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const updates = result.data;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('"name" = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('"description" = ?');
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      setClauses.push('"status" = ?');
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      setClauses.push('"priority" = ?');
      values.push(updates.priority);
    }
    if (updates.clientName !== undefined) {
      setClauses.push('"clientName" = ?');
      values.push(updates.clientName);
    }
    if (updates.color !== undefined) {
      setClauses.push('"color" = ?');
      values.push(updates.color);
    }
    if (updates.deadline !== undefined) {
      setClauses.push('"deadline" = ?');
      values.push(updates.deadline);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    setClauses.push('"updatedAt" = datetime(\'now\')');

    await client.execute({
      sql: `UPDATE "Project" SET ${setClauses.join(", ")} WHERE id = ?`,
      args: [...values, id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: "UPDATE_PROJECT",
      details: `Updated project ${existing.rows[0].name}: ${Object.keys(updates).join(", ")}`,
      entity: "project",
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    // Fetch updated project
    const updated = await client.execute({
      sql: `SELECT p.*,
              (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm."projectId" = p.id AND pm."removedAt" IS NULL) as memberCount
            FROM "Project" p
            WHERE p.id = ?`,
      args: [id],
    });

    const row = updated.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        project: {
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
        },
      },
    });
  } catch (error) {
    console.error("[PATCH /api/projects/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] — Archive project (SUPERADMIN only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Only SUPERADMIN can delete projects
    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    // Check project exists
    const existing = await client.execute({
      sql: 'SELECT id, name FROM "Project" WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Soft delete by setting status to ARCHIVED
    await client.execute({
      sql: 'UPDATE "Project" SET "status" = \'ARCHIVED\', "updatedAt" = datetime(\'now\') WHERE id = ?',
      args: [id],
    });

    // Audit log
    await logActivity({
      userId: user.id,
      action: "DELETE_PROJECT",
      details: `Archived project: ${existing.rows[0].name}`,
      entity: "project",
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: "Project archived" });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
