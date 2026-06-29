import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { generatePdfBase64 } from "@/lib/generate-pdf";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, type, fileData, content } = body;

    if (!projectId || !type) {
      return NextResponse.json({ success: false, error: "projectId and type are required" }, { status: 400 });
    }

    if (!["pdf", "text"].includes(type)) {
      return NextResponse.json({ success: false, error: "type must be 'pdf' or 'text'" }, { status: 400 });
    }

    if (type === "text" && !content) {
      return NextResponse.json({ success: false, error: "content is required for text type" }, { status: 400 });
    }

    if (type === "pdf" && !fileData) {
      return NextResponse.json({ success: false, error: "fileData is required for pdf type" }, { status: 400 });
    }

    const client = getTursoClient();
    const ip = getClientIp(request);
    const docId = crypto.randomUUID();

    if (type === "pdf") {
      // Store the PDF as-is
      await client.execute({
        sql: `INSERT INTO "ProjectDocument" (id, "projectId", "docType", title, content, "pdfData", version, "createdAt", "updatedAt")
              VALUES (?, ?, 'requirements', ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        args: [
          docId,
          projectId,
          "Product Requirements (PDF)",
          "Uploaded Product Requirements Document (PDF)",
          fileData,
        ],
      });
    } else {
      // For text, generate a styled PDF and store both content + pdfData
      const pdfContent = "# Product Requirements\n\n" + content;
      let pdfBase64: string | null = null;
      try {
        pdfBase64 = await generatePdfBase64(pdfContent, projectId);
      } catch (pdfErr) {
        console.error("[POST /api/ai/onboarding] PDF generation failed (non-fatal):", pdfErr);
      }
      await client.execute({
        sql: `INSERT INTO "ProjectDocument" (id, "projectId", "docType", title, content, "pdfData", version, "createdAt", "updatedAt")
              VALUES (?, ?, 'requirements', ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        args: [
          docId,
          projectId,
          "Product Requirements",
          pdfContent,
          pdfBase64,
        ],
      });
    }

    await logActivity({
      userId: user.id,
      action: "ONBOARDING_SUBMIT",
      details: "Submitted project requirements via onboarding (" + type + ")",
      entity: "project_document",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: docId,
        projectId,
        docType: "requirements",
        type,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/onboarding] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// GET: Check if project has documents
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const client = getTursoClient();

    // Check ProjectDocument table (try/catch in case table doesn't exist yet)
    let documents: { id: string; docType: string; content: string; createdAt: string }[] = [];
    try {
      const result = await client.execute({
        sql: `SELECT id, "docType", content, "createdAt" FROM "ProjectDocument" WHERE "projectId" = ? ORDER BY "createdAt" DESC`,
        args: [projectId],
      });
      documents = result.rows.map((row) => ({
        id: row.id as string,
        docType: row.docType as string,
        content: row.content as string,
        createdAt: row.createdAt as string,
      }));
    } catch (err) {
      console.warn("[GET /api/ai/onboarding] ProjectDocument table not available:", err);
    }

    // Also check if project has existing chat history (AiChat)
    // If chat exists, consider the project as already onboarded
    let hasChatHistory = false;
    try {
      const chatResult = await client.execute({
        sql: `SELECT COUNT(*) as cnt FROM "AiChat" WHERE "projectId" = ?`,
        args: [projectId],
      });
      if (chatResult.rows.length > 0 && Number(chatResult.rows[0].cnt) > 0) {
        hasChatHistory = true;
      }
    } catch (err) {
      console.warn("[GET /api/ai/onboarding] AiChat check failed:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        documents,
        hasDocuments: documents.length > 0,
        hasChatHistory,
        isOnboarded: documents.length > 0 || hasChatHistory,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/onboarding] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
