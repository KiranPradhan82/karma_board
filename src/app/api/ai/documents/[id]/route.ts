import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/ai/documents/[id] — Get single document metadata or download PDF
export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download") === "true";

    const client = getTursoClient();
    const result = await client.execute({
      sql: 'SELECT id, "projectId", "docType", title, content, "pdfData", version, "createdAt", "updatedAt" FROM "ProjectDocument" WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const row = result.rows[0];

    if (download) {
      // Download mode — return PDF binary directly
      const pdfData = row.pdfData as string;

      if (!pdfData || pdfData.length === 0) {
        return NextResponse.json({ success: false, error: "PDF data not available. The document may have been created before PDF generation was available." }, { status: 404 });
      }

      const pdfBuffer = Buffer.from(pdfData, "base64");
      const safeFilename = (row.title as string || "Document").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="' + safeFilename + '.pdf"',
        },
      });
    }

    // Metadata mode — return document info (no pdfData, too large)
    return NextResponse.json({
      success: true,
      data: {
        id: row.id as string,
        projectId: row.projectId as string,
        docType: row.docType as string,
        title: row.title as string,
        content: row.content as string,
        version: Number(row.version) || 1,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        hasPdf: !!(row.pdfData as string),
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/documents/[id]] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
