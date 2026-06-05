import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole } from "@/lib/api-auth";
import PDFDocument from "pdfkit";

interface RouteContext {
  params: Promise<{}>;
}

// Extend Vercel serverless timeout — PDF generation can take a while for large docs
export const maxDuration = 30;

// Strip emoji and non-Latin Unicode that pdfkit's Helvetica can't render
// Keeps basic Latin, numbers, punctuation, and common symbols
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")     // Emoji & symbols
    .replace(/[\u{2600}-\u{27BF}]/gu, "")          // Misc symbols
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")          // Variation selectors
    .replace(/[\u{200D}]/gu, "")                     // Zero-width joiner
    .replace(/[\u{20E3}]/gu, "")                     // Combining enclosing keycap
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")         // Tags
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")         // Supplementary planes (rare scripts)
    .trim();
}

// Simple markdown-to-plain-text parser for PDF rendering
function parseMarkdownToLines(md: string): { text: string; style: "h1" | "h2" | "h3" | "bold" | "bullet" | "normal" | "table" | "tableRow" | "code" | "hr" }[] {
  const lines: { text: string; style: typeof styles[number] }[] = [];
  const styles = ["h1", "h2", "h3", "bold", "bullet", "normal", "table", "tableRow", "code", "hr"] as const;

  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // H1
    if (line.startsWith("# ")) {
      lines.push({ text: sanitizeForPdf(line.replace(/^# /, "")), style: "h1" });
      continue;
    }
    // H2
    if (line.startsWith("## ")) {
      lines.push({ text: sanitizeForPdf(line.replace(/^## /, "")), style: "h2" });
      continue;
    }
    // H3
    if (line.startsWith("### ")) {
      lines.push({ text: sanitizeForPdf(line.replace(/^### /, "")), style: "h3" });
      continue;
    }
    // H4
    if (line.startsWith("#### ")) {
      lines.push({ text: sanitizeForPdf(line.replace(/^#### /, "")), style: "h3" });
      continue;
    }
    // Horizontal rule
    if (/^---+$/.test(line) || /^={3,}$/.test(line)) {
      lines.push({ text: "", style: "hr" });
      continue;
    }
    // Code block start/end — skip the fence marker, render code content as indented text
    if (line.startsWith("```")) continue;
    // Bullet
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      const clean = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
      lines.push({ text: sanitizeForPdf(clean.replace(/\*\*/g, "")), style: "bullet" });
      continue;
    }
    // Table row
    if (line.startsWith("|")) {
      const cells = line.split("|").filter(c => c.trim()).map(c => c.trim().replace(/\*\*/g, ""));
      if (cells.every(c => /^[-:]+$/.test(c))) continue; // skip separator rows
      lines.push({ text: sanitizeForPdf(cells.join("  |  ")), style: "tableRow" });
      continue;
    }
    // Normal with bold stripping
    const cleanText = line.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`([^`]+)`/g, "$1");
    lines.push({ text: sanitizeForPdf(cleanText), style: "normal" });
  }

  return lines;
}

// Generate PDF from markdown content
async function generatePdfBuffer(content: string): Promise<Buffer> {
  const buffers: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  const parsedLines = parseMarkdownToLines(content);
  const pageWidth = doc.page.width - 100; // 50px margin each side

  try {
    for (const { text, style } of parsedLines) {
      // Check if we need a new page
      if (doc.y > 720) {
        doc.addPage();
      }

      switch (style) {
        case "h1":
          doc.moveDown(0.5);
          doc.fontSize(20).font("Helvetica-Bold").text(text, { width: pageWidth });
          doc.moveDown(0.3);
          break;
        case "h2":
          doc.moveDown(0.4);
          doc.fontSize(15).font("Helvetica-Bold").text(text, { width: pageWidth });
          doc.moveDown(0.2);
          break;
        case "h3":
          doc.moveDown(0.3);
          doc.fontSize(12).font("Helvetica-Bold").text(text, { width: pageWidth });
          doc.moveDown(0.15);
          break;
        case "bullet":
          doc.fontSize(9.5).font("Helvetica").text(`  ${text}`, { width: pageWidth - 15, indent: 10 });
          break;
        case "tableRow":
          doc.fontSize(8.5).font("Helvetica").fillColor("#333333").text(text, { width: pageWidth });
          break;
        case "hr":
          doc.moveDown(0.3);
          doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke("#cccccc");
          doc.moveDown(0.3);
          break;
        default:
          doc.fontSize(9.5).font("Helvetica").text(text, { width: pageWidth, lineGap: 2 });
          break;
      }
    }

    // Add page numbers to all pages
    try {
      const internalDoc = doc as unknown as { bufferedPages: unknown[] };
      const pageCount = internalDoc.bufferedPages?.length || 1;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font("Helvetica").fillColor("#999999").text(
          `Page ${i + 1} of ${pageCount}`,
          50,
          doc.page.height - 35,
          { width: pageWidth, align: "center" }
        );
      }
    } catch (pageErr) {
      console.error("[export-pdf] Page numbering failed (non-fatal):", pageErr);
    }

    doc.fillColor("#000000");
    doc.end();
  } catch (renderErr) {
    console.error("[export-pdf] Rendering failed:", renderErr);
    // Try to end the doc even if rendering partially failed
    try { doc.end(); } catch { /* ignore */ }
  }

  // CRITICAL: Wait for doc.end() to flush all data chunks before concatenating
  await new Promise<void>((resolve) => doc.on("end", resolve));

  return Buffer.concat(buffers);
}

// POST /api/ai/export-pdf — Convert markdown content to PDF
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { content, filename } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
    }

    const safeFilename = (filename || "Document").replace(/[^a-zA-Z0-9_-]/g, "_");
    const pdfBuffer = await generatePdfBuffer(content);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/export-pdf] Error:", error);
    return NextResponse.json({
      success: false,
      error: `Failed to generate PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}

// GET /api/ai/export-pdf — Generate PDF from a chat message by ID
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");
    const filename = searchParams.get("filename") || "Document";

    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId is required" }, { status: 400 });
    }

    console.log("[GET /api/ai/export-pdf] Fetching message:", messageId?.slice(0, 8) + "...");

    // Dynamically import getTursoClient to avoid circular deps
    const { getTursoClient } = await import("@/lib/api-auth");
    const client = getTursoClient();

    // Fetch the message
    const result = await client.execute({
      sql: `SELECT content, role FROM "AiChat" WHERE id = ?`,
      args: [messageId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 });
    }

    const msg = result.rows[0];
    const content = msg.content as string;

    console.log("[GET /api/ai/export-pdf] Content length:", content.length, "chars");

    if (!content || content.length < 10) {
      return NextResponse.json({ success: false, error: "Message content is too short to export" }, { status: 400 });
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const pdfBuffer = await generatePdfBuffer(content);

    console.log("[GET /api/ai/export-pdf] PDF generated:", pdfBuffer.length, "bytes");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/export-pdf] Error:", error);
    return NextResponse.json({
      success: false,
      error: `Failed to generate PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
