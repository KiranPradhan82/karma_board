import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { generatePdfBase64 } from "@/lib/generate-pdf";

interface RouteContext {
  params: Promise<{}>;
}

// GET /api/ai/documents — List all documents for a project
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
    const result = await client.execute({
      sql: 'SELECT id, "projectId", "docType", title, version, "createdAt", "updatedAt" FROM "ProjectDocument" WHERE "projectId" = ? ORDER BY "docType" ASC',
      args: [projectId],
    });

    const documents = result.rows.map((row) => ({
      id: row.id as string,
      projectId: row.projectId as string,
      docType: row.docType as string,
      title: row.title as string,
      version: Number(row.version) || 1,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    }));

    return NextResponse.json({ success: true, data: { documents } });
  } catch (error) {
    console.error("[GET /api/ai/documents] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/ai/documents — Create or update document
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, docType, title, content } = body;

    if (!projectId || !docType || !content) {
      return NextResponse.json({ success: false, error: "projectId, docType, and content are required" }, { status: 400 });
    }

    const safeTitle = (title || docType.toUpperCase() + " Document").slice(0, 200);
    const client = getTursoClient();

    // Generate PDF from markdown content
    let pdfBase64 = "";
    try {
      pdfBase64 = await generatePdfBase64(content);
    } catch (pdfErr) {
      console.error("[POST /api/ai/documents] PDF generation error (non-fatal):", pdfErr);
    }

    // Check if document already exists
    const existing = await client.execute({
      sql: 'SELECT id, version FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" = ?',
      args: [projectId, docType],
    });

    if (existing.rows.length > 0) {
      // Update existing — increment version
      const existingId = existing.rows[0].id as string;
      const newVersion = Number(existing.rows[0].version) + 1;

      await client.execute({
        sql: 'UPDATE "ProjectDocument" SET title = ?, content = ?, "pdfData" = ?, version = ?, "updatedAt" = datetime(\'now\') WHERE id = ?',
        args: [safeTitle, content, pdfBase64, newVersion, existingId],
      });

      console.log("[POST /api/ai/documents] Updated document:", docType, "v" + newVersion);

      return NextResponse.json({
        success: true,
        data: { id: existingId, projectId, docType, title: safeTitle, version: newVersion },
      });
    } else {
      // Create new
      const newId = crypto.randomUUID();

      await client.execute({
        sql: 'INSERT INTO "ProjectDocument" (id, "projectId", "docType", title, content, "pdfData", version, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
        args: [newId, projectId, docType, safeTitle, content, pdfBase64],
      });

      console.log("[POST /api/ai/documents] Created document:", docType, "v1");

      return NextResponse.json({
        success: true,
        data: { id: newId, projectId, docType, title: safeTitle, version: 1 },
      });
    }
  } catch (error) {
    console.error("[POST /api/ai/documents] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/ai/documents — Update document by id
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { id, content, title } = body;

    if (!id || !content) {
      return NextResponse.json({ success: false, error: "id and content are required" }, { status: 400 });
    }

    const client = getTursoClient();

    // Check document exists
    const existing = await client.execute({
      sql: 'SELECT id, version FROM "ProjectDocument" WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const newVersion = Number(existing.rows[0].version) + 1;

    // Generate PDF
    let pdfBase64 = "";
    try {
      pdfBase64 = await generatePdfBase64(content);
    } catch (pdfErr) {
      console.error("[PUT /api/ai/documents] PDF generation error (non-fatal):", pdfErr);
    }

    // Update
    const safeTitle = title || undefined;
    if (safeTitle) {
      await client.execute({
        sql: 'UPDATE "ProjectDocument" SET title = ?, content = ?, "pdfData" = ?, version = ?, "updatedAt" = datetime(\'now\') WHERE id = ?',
        args: [safeTitle, content, pdfBase64, newVersion, id],
      });
    } else {
      await client.execute({
        sql: 'UPDATE "ProjectDocument" SET content = ?, "pdfData" = ?, version = ?, "updatedAt" = datetime(\'now\') WHERE id = ?',
        args: [content, pdfBase64, newVersion, id],
      });
    }

    return NextResponse.json({
      success: true,
      data: { id, version: newVersion },
    });
  } catch (error) {
    console.error("[PUT /api/ai/documents] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
