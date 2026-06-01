import { NextRequest, NextResponse } from "next/server";
import { getTursoClient, getAuthUser, requireRole, logActivity, getClientIp } from "@/lib/api-auth";
import PDFDocument from "pdfkit";

interface RouteContext {
  params: Promise<{}>;
}

// GET /api/ai/project-pdf — Generate project PDF (SUPERADMIN only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const roleCheck = requireRole(["SUPERADMIN"]);
    const forbidden = roleCheck(user);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Fetch project details
    const projectResult = await client.execute({
      sql: `SELECT * FROM "Project" WHERE id = ?`,
      args: [projectId],
    });
    if (projectResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
    const project = projectResult.rows[0];

    // Fetch team members
    const teamResult = await client.execute({
      sql: `SELECT u.name, u.email, pm.role, pm."joinedAt"
            FROM "ProjectMember" pm
            JOIN "User" u ON pm."userId" = u.id
            WHERE pm."projectId" = ? AND pm."removedAt" IS NULL
            ORDER BY pm.role ASC`,
      args: [projectId],
    });

    // Fetch chat history
    const chatResult = await client.execute({
      sql: `SELECT m.role, m.content, m.timestamp, u.name as userName
            FROM "AiChat" m
            LEFT JOIN "User" u ON m."userId" = u.id
            WHERE m."projectId" = ?
            ORDER BY m.timestamp ASC`,
      args: [projectId],
    });

    // Fetch protocol steps
    const stepsResult = await client.execute({
      sql: `SELECT ps.title, ps.description, ps."commandTag", ps."stepOrder"
            FROM "AiProtocolStep" ps
            JOIN "AiProtocol" p ON ps."protocolId" = p.id
            WHERE (p."isGlobal" = 1 OR p."projectId" = ?)
            ORDER BY ps."stepOrder" ASC`,
      args: [projectId],
    });

    // Build PDF
    const buffers: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));

    const title = project.name as string;
    const filename = `${title.replace(/\s+/g, "_")}_Report.pdf`;

    // Header
    doc.fontSize(24).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toISOString()}`, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Status: ${project.status}`, { align: "center" });
    doc.moveDown(1.5);

    // Separator
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
    doc.moveDown(1);

    // Project Overview
    doc.fontSize(16).font("Helvetica-Bold").text("Project Overview");
    doc.moveDown(0.5);
    if (project.description) {
      doc.fontSize(10).font("Helvetica").text(project.description as string);
      doc.moveDown(0.5);
    }
    if (project.clientName) {
      doc.fontSize(10).font("Helvetica-Bold").text("Client: ", { continued: true });
      doc.font("Helvetica").text(project.clientName as string);
    }
    if (project.priority) {
      doc.fontSize(10).font("Helvetica-Bold").text("Priority: ", { continued: true });
      doc.font("Helvetica").text(project.priority as string);
    }
    if (project.deadline) {
      doc.fontSize(10).font("Helvetica-Bold").text("Deadline: ", { continued: true });
      doc.font("Helvetica").text(project.deadline as string);
    }
    doc.moveDown(1.5);

    // Team Members
    doc.fontSize(16).font("Helvetica-Bold").text("Team Members");
    doc.moveDown(0.5);
    if (teamResult.rows.length > 0) {
      for (const member of teamResult.rows) {
        doc.fontSize(10).font("Helvetica-Bold").text(`${member.name} `, { continued: true });
        doc.font("Helvetica").text(`(${member.role}) — ${member.email}`);
      }
    } else {
      doc.fontSize(10).font("Helvetica").text("No team members found.");
    }
    doc.moveDown(1.5);

    // Protocol Steps
    if (stepsResult.rows.length > 0) {
      doc.fontSize(16).font("Helvetica-Bold").text("Documentation Protocol Steps");
      doc.moveDown(0.5);
      for (const step of stepsResult.rows) {
        const num = Number(step.stepOrder);
        doc.fontSize(10).font("Helvetica-Bold").text(`${num}. ${step.title}`);
        if (step.description) {
          doc.font("Helvetica").text(`   ${step.description}`);
        }
        if (step.commandTag) {
          doc.font("Helvetica").text(`   Command: /${step.commandTag}`, { color: "#666666" });
        }
        doc.moveDown(0.3);
      }
      doc.moveDown(1);
    }

    // Chat History
    doc.fontSize(16).font("Helvetica-Bold").text("Chat History");
    doc.moveDown(0.5);
    if (chatResult.rows.length > 0) {
      for (const msg of chatResult.rows) {
        const role = msg.role === "assistant" ? "AI Assistant" : `${msg.userName || "User"}`;
        doc.fontSize(9).font("Helvetica-Bold").text(`[${role}]`, { continued: true });
        doc.font("Helvetica").text(` ${msg.timestamp}`);
        doc.moveDown(0.2);

        // Handle long content with pagination check
        const contentText = msg.content as string;
        const textHeight = doc.heightOfString(contentText, { width: 450 });
        if (doc.y + textHeight > 750) {
          doc.addPage();
        }
        doc.fontSize(9).font("Helvetica").text(contentText, { width: 450, lineGap: 2 });
        doc.moveDown(0.8);

        // Separator line
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e0e0e0");
        doc.moveDown(0.5);
      }
    } else {
      doc.fontSize(10).font("Helvetica").text("No chat history found.");
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font("Helvetica").fillColor("#999999").text("Generated by KarmaBoard — Karma Space AI", { align: "center" });
    doc.fillColor("#000000");

    doc.end();

    await new Promise<void>((resolve) => {
      doc.on("end", resolve);
    });

    const pdfBuffer = Buffer.concat(buffers);

    // Log activity
    await logActivity({
      userId: user.id,
      action: "EXPORT_PROJECT_PDF",
      details: `Exported PDF for project: ${title}`,
      entity: "project",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/project-pdf] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
