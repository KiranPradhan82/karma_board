import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, logActivity, getClientIp } from "@/lib/api-auth";

// GET /api/ai/protocols — List protocols (global + project-specific)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || "";

    const client = getTursoClient();

    let protocolsResult;

    if (projectId) {
      protocolsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocol" WHERE "isGlobal" = 1 OR "projectId" = ? ORDER BY "isGlobal" DESC, "createdAt" ASC`,
        args: [projectId],
      });
    } else {
      protocolsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocol" ORDER BY "isGlobal" DESC, "createdAt" ASC`,
        args: [],
      });
    }

    const protocols = [];

    for (const row of protocolsResult.rows) {
      const stepsResult = await client.execute({
        sql: `SELECT * FROM "AiProtocolStep" WHERE "protocolId" = ? ORDER BY "stepOrder" ASC`,
        args: [row.id],
      });

      protocols.push({
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
      });
    }

    return NextResponse.json({
      success: true,
      data: { protocols },
    });
  } catch (error) {
    console.error("[GET /api/ai/protocols] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/ai/protocols — Create protocol (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { name, description, isGlobal, projectId, steps } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);
    const protocolId = crypto.randomUUID();

    await client.execute({
      sql: `INSERT INTO "AiProtocol" (id, name, description, "isGlobal", "projectId", "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        protocolId,
        name,
        description || null,
        isGlobal ? 1 : 0,
        projectId || null,
      ],
    });

    // Create steps
    if (steps && Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = crypto.randomUUID();
        await client.execute({
          sql: `INSERT INTO "AiProtocolStep" (id, "protocolId", title, description, "commandTag", "stepOrder", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [
            stepId,
            protocolId,
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
      action: "CREATE_PROTOCOL",
      details: `Created protocol: ${name}`,
      entity: "ai_protocol",
      entityId: protocolId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          protocol: {
            id: protocolId,
            name,
            description: description || null,
            isGlobal: Boolean(isGlobal),
            projectId: projectId || null,
            steps: steps || [],
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/ai/protocols] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
