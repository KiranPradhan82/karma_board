import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, logActivity, getClientIp } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/ai/protocols/[id] — Get single protocol with steps
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await context.params;
    const client = getTursoClient();

    const protocolResult = await client.execute({
      sql: `SELECT * FROM "AiProtocol" WHERE id = ?`,
      args: [id],
    });

    if (protocolResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Protocol not found" }, { status: 404 });
    }

    const row = protocolResult.rows[0];

    const stepsResult = await client.execute({
      sql: `SELECT * FROM "AiProtocolStep" WHERE "protocolId" = ? ORDER BY "stepOrder" ASC`,
      args: [id],
    });

    return NextResponse.json({
      success: true,
      data: {
        protocol: {
          id: row.id,
          name: row.name,
          description: row.description,
          isGlobal: Boolean(row.isGlobal),
          projectId: row.projectId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          steps: stepsResult.rows.map((s) => ({
            id: s.id,
            protocolId: s.protocolId,
            title: s.title,
            description: s.description,
            commandTag: s.commandTag,
            stepOrder: Number(s.stepOrder),
            createdAt: s.createdAt,
          })),
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/protocols/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/ai/protocols/[id] — Update protocol (SUPERADMIN only)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    const existing = await client.execute({
      sql: `SELECT id, name FROM "AiProtocol" WHERE id = ?`,
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Protocol not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, isGlobal, projectId, steps } = body;

    const setClauses: string[] = [`"updatedAt" = datetime('now')`];
    const values: unknown[] = [];

    if (name !== undefined) {
      setClauses.push(`"name" = ?`);
      values.push(name);
    }
    if (description !== undefined) {
      setClauses.push(`"description" = ?`);
      values.push(description);
    }
    if (isGlobal !== undefined) {
      setClauses.push(`"isGlobal" = ?`);
      values.push(isGlobal ? 1 : 0);
    }
    if (projectId !== undefined) {
      setClauses.push(`"projectId" = ?`);
      values.push(projectId || null);
    }

    if (setClauses.length > 1) {
      await client.execute({
        sql: `UPDATE "AiProtocol" SET ${setClauses.join(", ")} WHERE id = ?`,
        args: [...values, id],
      });
    }

    // If steps provided, replace them
    if (steps && Array.isArray(steps)) {
      await client.execute({
        sql: `DELETE FROM "AiProtocolStep" WHERE "protocolId" = ?`,
        args: [id],
      });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = crypto.randomUUID();
        await client.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [
            stepId,
            id,
            step.title,
            step.description || null,
            step.commandTag || null,
            step.stepOrder !== undefined ? step.stepOrder : i + 1,
          ],
        });
      }
    }

    await logActivity({
      userId: user.id,
      action: "UPDATE_PROTOCOL",
      details: `Updated protocol: ${existing.rows[0].name}`,
      entity: "ai_protocol",
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: { message: "Protocol updated" },
    });
  } catch (error) {
    console.error("[PUT /api/ai/protocols/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/ai/protocols/[id] — Delete protocol (SUPERADMIN only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    const existing = await client.execute({
      sql: `SELECT id, name FROM "AiProtocol" WHERE id = ?`,
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Protocol not found" }, { status: 404 });
    }

    // Delete steps first (cascade), then protocol
    await client.execute({
      sql: `DELETE FROM "AiProtocolStep" WHERE "protocolId" = ?`,
      args: [id],
    });
    await client.execute({
      sql: `DELETE FROM "AiProtocol" WHERE id = ?`,
      args: [id],
    });

    await logActivity({
      userId: user.id,
      action: "DELETE_PROTOCOL",
      details: `Deleted protocol: ${existing.rows[0].name}`,
      entity: "ai_protocol",
      entityId: id,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({ success: true, message: "Protocol deleted" });
  } catch (error) {
    console.error("[DELETE /api/ai/protocols/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
