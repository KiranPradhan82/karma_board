import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole } from "@/lib/api-auth";
import PDFDocument from "pdfkit";

interface RouteContext {
  params: Promise<{}>;
}

// Extend Vercel serverless timeout — PDF generation can take a while for large docs
export const maxDuration = 30;

// ===== THEME COLORS =====
const THEME = {
  primary: "#1E40AF",      // Deep blue — headings, accents
  primaryLight: "#3B82F6", // Bright blue — table headers
  primaryBg: "#EFF6FF",    // Very light blue — table header bg
  altRowBg: "#F9FAFB",     // Subtle gray — alternating table rows
  headingText: "#111827",   // Near-black — heading text
  bodyText: "#374151",      // Dark gray — body text
  mutedText: "#6B7280",     // Medium gray — secondary text
  borderColor: "#E5E7EB",   // Light gray — borders, dividers
  white: "#FFFFFF",
  coverGradientTop: "#1E3A8A", // Deep navy
  coverGradientBottom: "#1E40AF", // Blue
  accent: "#059669",       // Green — for success/priority badges
  warning: "#D97706",       // Amber — for warnings
  danger: "#DC2626",       // Red — for high priority/critical
};

// ===== SANITIZATION =====
// Strip ALL characters that pdfkit's Helvetica (WinAnsiEncoding) can't render.
function sanitizeForPdf(text: string): string {
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, "").replace(/[^\x20-\x7E\xA1-\xFF]/g, "").trim();
}

// ===== MARKDOWN PARSER =====
type MdElement =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "bullet"; text: string; indent: number }
  | { type: "normal"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "hr" };

function parseMarkdown(md: string): MdElement[] {
  const elements: MdElement[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i++; continue; }

    // H1
    if (/^#{1}\s+/.test(line) && !line.startsWith("##")) {
      elements.push({ type: "h1", text: sanitizeForPdf(line.replace(/^#\s+/, "")) });
      i++; continue;
    }
    // H2
    if (/^#{2}\s+/.test(line) && !line.startsWith("###")) {
      elements.push({ type: "h2", text: sanitizeForPdf(line.replace(/^##\s+/, "")) });
      i++; continue;
    }
    // H3
    if (/^#{3}\s+/.test(line) && !line.startsWith("####")) {
      elements.push({ type: "h3", text: sanitizeForPdf(line.replace(/^###\s+/, "")) });
      i++; continue;
    }
    // H4 -> treat as H3
    if (/^#{4}\s+/.test(line)) {
      elements.push({ type: "h3", text: sanitizeForPdf(line.replace(/^####\s+/, "")) });
      i++; continue;
    }
    // HR
    if (/^---+$/.test(line) || /^={3,}$/.test(line)) {
      elements.push({ type: "hr" });
      i++; continue;
    }
    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(sanitizeForPdf(lines[i].trimEnd()));
        i++;
      }
      i++; // skip closing ```
      elements.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }
    // Table — collect all consecutive table lines
    if (line.startsWith("|")) {
      const headers: string[] = [];
      const rows: string[][] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|")
          .filter(c => c.trim() !== "")
          .map(c => sanitizeForPdf(c.trim().replace(/\*\*/g, "")));

        // Skip separator rows (---, :--, etc.)
        if (cells.every(c => /^[-:]+$/.test(c))) {
          isHeader = false;
          i++; continue;
        }

        if (isHeader) {
          headers.push(...cells);
        } else {
          rows.push(cells);
        }
        i++;
      }
      if (headers.length > 0) {
        elements.push({ type: "table", headers, rows });
      }
      continue;
    }
    // Bullet / numbered list
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? Math.min(Math.floor(indentMatch[1].length / 2), 3) : 0;
      const clean = line.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "");
      elements.push({ type: "bullet", text: sanitizeForPdf(clean.replace(/\*\*/g, "")), indent });
      i++; continue;
    }
    // Normal paragraph text — merge consecutive non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i].trim();
      if (!pLine) break;
      if (pLine.startsWith("#") || pLine.startsWith("|") || pLine.startsWith("```") ||
          /^---+$/.test(pLine) || /^={3,}$/.test(pLine)) break;
      if (pLine.match(/^[-*]\s+/) || pLine.match(/^\d+\.\s+/)) break;
      paraLines.push(sanitizeForPdf(pLine.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`([^`]+)`/g, "$1")));
      i++;
    }
    if (paraLines.length > 0) {
      elements.push({ type: "normal", text: paraLines.join(" ") });
    }
  }

  return elements;
}

// ===== PDF RENDERER =====
const MARGIN = 50;
const CONTENT_WIDTH = 595.28 - (MARGIN * 2); // A4 width minus margins

async function generatePdfBuffer(content: string): Promise<Buffer> {
  const buffers: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  const elements = parseMarkdown(content);
  if (elements.length === 0) {
    doc.fontSize(11).font("Helvetica").fillColor(THEME.bodyText)
      .text("No content to render.", { width: CONTENT_WIDTH });
    doc.end();
    await new Promise<void>((resolve) => doc.on("end", resolve));
    return Buffer.concat(buffers);
  }

  // Extract document title from first H1, or from first line
  const firstH1 = elements.find(e => e.type === "h1");
  const docTitle = firstH1 ? (firstH1 as { type: "h1"; text: string }).text : "Document";
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ===== COVER HEADER =====
  // Blue gradient bar at top
  const barHeight = 100;
  doc.save();
  doc.rect(0, 0, 595.28, barHeight).fill(THEME.coverGradientTop);
  // Lighter accent stripe
  doc.rect(0, barHeight, 595.28, 4).fill(THEME.primaryLight);
  doc.restore();

  // Title on cover
  doc.fontSize(22).font("Helvetica-Bold").fillColor(THEME.white)
    .text(docTitle, MARGIN, 22, { width: CONTENT_WIDTH });

  // Subtitle line
  doc.fontSize(9).font("Helvetica").fillColor("#93C5FD")
    .text(`Generated by KarmaBoard AI  |  ${generatedDate}`, MARGIN, 58, { width: CONTENT_WIDTH });

  // Thin decorative line under subtitle
  doc.moveTo(MARGIN, 80).lineTo(MARGIN + CONTENT_WIDTH, 80).stroke("#60A5FA");
  doc.fillColor(THEME.bodyText); // reset

  // Start content below cover bar
  doc.y = barHeight + 24;
  let skipFirstH1 = !!firstH1; // don't re-render the first H1 since it's in the header

  // ===== HELPER: Check space or add new page =====
  const ensureSpace = (needed: number) => {
    if (doc.y + needed > 780) {
      // Page footer
      addPageFooter(doc);
      doc.addPage();
      // Thin top accent line
      doc.save();
      doc.rect(0, 0, 595.28, 3).fill(THEME.primary);
      doc.restore();
      doc.y = 18;
    }
  };

  // ===== RENDER TABLE =====
  const renderTable = (headers: string[], rows: string[][]) => {
    if (headers.length === 0) return;

    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    // Calculate column widths based on content
    const colWidths = calculateColumnWidths(headers, rows, colCount);
    const cellPadding = 6;
    const fontSize = 8;
    const headerFontSize = 8.5;

    // Estimate table height
    const headerHeight = headerFontSize + (cellPadding * 2) + 4;
    let totalRowsHeight = 0;
    for (const row of rows) {
      let maxH = fontSize + (cellPadding * 2);
      for (let c = 0; c < colCount; c++) {
        const cellText = row[c] || "";
        const h = doc.heightOfString(cellText, { width: colWidths[c] - (cellPadding * 2), fontSize });
        maxH = Math.max(maxH, h + (cellPadding * 2));
      }
      totalRowsHeight += maxH;
    }
    const tableHeight = headerHeight + totalRowsHeight + rows.length + 4;

    ensureSpace(Math.min(tableHeight, 200)); // ensure at least some space

    const tableX = MARGIN;
    let y = doc.y;

    // Draw table header background
    doc.save();
    doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).fill(THEME.primaryBg);
    // Left accent stripe on header
    doc.rect(tableX, y, 3, headerHeight).fill(THEME.primaryLight);
    doc.restore();

    // Draw header borders
    doc.save();
    doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).stroke(THEME.borderColor);
    // Vertical separator lines in header
    let xPos = tableX;
    for (let c = 0; c < colCount - 1; c++) {
      xPos += colWidths[c];
      doc.moveTo(xPos, y).lineTo(xPos, y + headerHeight).stroke(THEME.borderColor);
    }
    doc.restore();

    // Draw header text
    doc.fillColor(THEME.primary);
    let cellX = tableX;
    for (let c = 0; c < colCount; c++) {
      const headerText = headers[c] || "";
      doc.fontSize(headerFontSize).font("Helvetica-Bold")
        .text(headerText, cellX + cellPadding, y + cellPadding + 1, {
          width: colWidths[c] - (cellPadding * 2),
          height: headerHeight,
        });
      cellX += colWidths[c];
    }

    y += headerHeight;

    // Draw rows
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isAlt = r % 2 === 1;

      // Calculate row height
      let rowHeight = fontSize + (cellPadding * 2);
      for (let c = 0; c < colCount; c++) {
        const cellText = row[c] || "";
        const h = doc.heightOfString(cellText, { width: colWidths[c] - (cellPadding * 2), fontSize });
        rowHeight = Math.max(rowHeight, h + (cellPadding * 2));
      }

      // Check if row fits on page
      if (y + rowHeight > 780) {
        // Finish current table partial border at bottom
        doc.save();
        doc.moveTo(tableX, y).lineTo(tableX + CONTENT_WIDTH, y).stroke(THEME.borderColor);
        doc.restore();
        addPageFooter(doc);
        doc.addPage();
        doc.save();
        doc.rect(0, 0, 595.28, 3).fill(THEME.primary);
        doc.restore();
        y = 18;

        // Redraw header on new page
        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).fill(THEME.primaryBg);
        doc.rect(tableX, y, 3, headerHeight).fill(THEME.primaryLight);
        doc.restore();
        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).stroke(THEME.borderColor);
        let xPos2 = tableX;
        for (let c = 0; c < colCount - 1; c++) {
          xPos2 += colWidths[c];
          doc.moveTo(xPos2, y).lineTo(xPos2, y + headerHeight).stroke(THEME.borderColor);
        }
        doc.restore();
        doc.fillColor(THEME.primary);
        let cellX2 = tableX;
        for (let c = 0; c < colCount; c++) {
          const headerText = headers[c] || "";
          doc.fontSize(headerFontSize).font("Helvetica-Bold")
            .text(headerText, cellX2 + cellPadding, y + cellPadding + 1, {
              width: colWidths[c] - (cellPadding * 2),
              height: headerHeight,
            });
          cellX2 += colWidths[c];
        }
        y += headerHeight;
      }

      // Alternating row background
      if (isAlt) {
        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).fill(THEME.altRowBg);
        doc.restore();
      }

      // Row border
      doc.save();
      doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).stroke(THEME.borderColor);
      // Vertical separators
      let xPos3 = tableX;
      for (let c = 0; c < colCount - 1; c++) {
        xPos3 += colWidths[c];
        doc.moveTo(xPos3, y).lineTo(xPos3, y + rowHeight).stroke(THEME.borderColor);
      }
      doc.restore();

      // Row text
      doc.fillColor(THEME.bodyText);
      let cellX3 = tableX;
      for (let c = 0; c < colCount; c++) {
        const cellText = row[c] || "";
        doc.fontSize(fontSize).font("Helvetica")
          .text(cellText, cellX3 + cellPadding, y + cellPadding, {
            width: colWidths[c] - (cellPadding * 2),
            height: rowHeight,
          });
        cellX3 += colWidths[c];
      }

      y += rowHeight;
    }

    doc.y = y + 8; // spacing after table
  };

  // Calculate proportional column widths
  const calculateColumnWidths = (headers: string[], rows: string[][], colCount: number): number[] => {
    // Measure max content width per column
    const maxLenPerCol: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const headerLen = (headers[c] || "").length;
      const maxRowLen = rows.reduce((max, row) => Math.max(max, (row[c] || "").length), 0);
      maxLenPerCol.push(Math.max(headerLen * 1.1, maxRowLen, 8)); // minimum 8 chars wide
    }
    const totalLen = maxLenPerCol.reduce((a, b) => a + b, 0);
    return maxLenPerCol.map(len => Math.max(60, (len / totalLen) * CONTENT_WIDTH));
  };

  // ===== RENDER ELEMENTS =====
  for (const el of elements) {
    try {
      switch (el.type) {
        case "h1": {
          if (skipFirstH1) { skipFirstH1 = false; break; }
          ensureSpace(50);
          doc.moveDown(0.6);
          // Blue left accent bar
          const h1Y = doc.y;
          doc.save();
          doc.rect(MARGIN, h1Y, 4, 22).fill(THEME.primary);
          doc.restore();
          doc.fontSize(18).font("Helvetica-Bold").fillColor(THEME.headingText)
            .text(el.text, MARGIN + 12, h1Y + 2, { width: CONTENT_WIDTH - 12 });
          doc.moveDown(0.15);
          // Underline
          doc.save();
          doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke(THEME.borderColor);
          doc.restore();
          doc.moveDown(0.4);
          break;
        }

        case "h2": {
          ensureSpace(40);
          doc.moveDown(0.5);
          // Section number badge
          const h2Y = doc.y;
          doc.save();
          doc.rect(MARGIN, h2Y, 3, 16).fill(THEME.primaryLight);
          doc.restore();
          doc.fontSize(14).font("Helvetica-Bold").fillColor(THEME.headingText)
            .text(el.text, MARGIN + 10, h2Y + 1, { width: CONTENT_WIDTH - 10 });
          doc.moveDown(0.1);
          // Thin underline
          doc.save();
          doc.moveTo(MARGIN + 10, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
            .strokeColor(THEME.borderColor).lineWidth(0.5).stroke();
          doc.restore();
          doc.moveDown(0.35);
          break;
        }

        case "h3": {
          ensureSpace(30);
          doc.moveDown(0.35);
          doc.fontSize(11.5).font("Helvetica-Bold").fillColor(THEME.primary)
            .text(el.text, { width: CONTENT_WIDTH });
          doc.moveDown(0.2);
          break;
        }

        case "bullet": {
          ensureSpace(18);
          const bulletX = MARGIN + (el.indent * 16);
          const bulletColor = el.indent === 0 ? THEME.primaryLight : THEME.mutedText;
          // Custom bullet dot
          doc.save();
          doc.circle(bulletX + 2, doc.y + 5, 2).fill(bulletColor);
          doc.restore();
          doc.fontSize(9.5).font("Helvetica").fillColor(THEME.bodyText)
            .text(el.text, bulletX + 10, doc.y - 2, {
              width: CONTENT_WIDTH - (el.indent * 16) - 10,
              lineGap: 1.5,
            });
          doc.moveDown(0.15);
          break;
        }

        case "normal": {
          ensureSpace(20);
          doc.fontSize(9.5).font("Helvetica").fillColor(THEME.bodyText)
            .text(el.text, MARGIN, doc.y, {
              width: CONTENT_WIDTH,
              lineGap: 2.5,
              paragraphGap: 4,
            });
          doc.moveDown(0.2);
          break;
        }

        case "table": {
          renderTable(el.headers, el.rows);
          break;
        }

        case "code": {
          ensureSpace(40);
          doc.moveDown(0.3);
          // Code background
          const codeLines = el.text.split("\n");
          const codeHeight = codeLines.length * 12 + 16;
          const codeY = doc.y;

          // Check if code block needs a page break
          if (codeY + Math.min(codeHeight, 300) > 780) {
            addPageFooter(doc);
            doc.addPage();
            doc.save();
            doc.rect(0, 0, 595.28, 3).fill(THEME.primary);
            doc.restore();
            doc.y = 18;
          }

          const finalCodeY = doc.y;
          const finalCodeHeight = Math.min(codeHeight, 760 - finalCodeY);
          doc.save();
          doc.rect(MARGIN, finalCodeY, CONTENT_WIDTH, finalCodeHeight).fill("#F3F4F6");
          // Left accent
          doc.rect(MARGIN, finalCodeY, 3, finalCodeHeight).fill(THEME.mutedText);
          doc.restore();

          doc.fontSize(8).font("Courier").fillColor(THEME.bodyText)
            .text(el.text, MARGIN + 12, finalCodeY + 8, {
              width: CONTENT_WIDTH - 20,
              lineGap: 3,
            });
          doc.y = finalCodeY + finalCodeHeight + 8;
          doc.moveDown(0.3);
          break;
        }

        case "hr": {
          ensureSpace(20);
          doc.moveDown(0.5);
          doc.save();
          const hrY = doc.y;
          doc.moveTo(MARGIN + 50, hrY).lineTo(MARGIN + CONTENT_WIDTH - 50, hrY)
            .strokeColor(THEME.borderColor).lineWidth(0.5).stroke();
          doc.restore();
          doc.moveDown(0.5);
          break;
        }
      }
    } catch (elErr) {
      console.error(`[export-pdf] Error rendering element:`, elErr instanceof Error ? elErr.message : elErr);
    }
  }

  // ===== PAGE NUMBERS =====
  try {
    const internalDoc = doc as unknown as { bufferedPages: unknown[] };
    const pageCount = internalDoc.bufferedPages?.length || 1;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      // Page number at bottom center
      doc.fontSize(8).font("Helvetica").fillColor(THEME.mutedText)
        .text(
          `Page ${i + 1} of ${pageCount}`,
          MARGIN,
          doc.page.height - 30,
          { width: CONTENT_WIDTH, align: "center" }
        );
      // "KarmaBoard" watermark at bottom right
      doc.fontSize(7).font("Helvetica").fillColor("#D1D5DB")
        .text("Generated by KarmaBoard", MARGIN, doc.page.height - 30, {
          width: CONTENT_WIDTH,
          align: "right",
        });
    }
  } catch (pageErr) {
    console.error("[export-pdf] Page numbering failed (non-fatal):", pageErr);
  }

  doc.fillColor(THEME.bodyText);
  doc.end();

  // CRITICAL: Wait for doc.end() to flush all data chunks before concatenating
  await new Promise<void>((resolve) => doc.on("end", resolve));

  return Buffer.concat(buffers);
}

// ===== PAGE FOOTER HELPER =====
function addPageFooter(doc: PDFDocument) {
  // This is called before adding a new page, so we add bottom elements to current page
  // We do nothing here — page numbers are added in a second pass at the end
}

// ===== API ROUTES =====

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
