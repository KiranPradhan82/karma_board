/**
 * Reusable PDF generation library for KarmaBoard.
 * Extracted from /api/ai/export-pdf to support programmatic usage.
 */

import PDFDocument from "pdfkit";

// ===== DEFAULT THEME COLORS =====
const DEFAULT_THEME = {
  primary: "#1E40AF",
  primaryLight: "#3B82F6",
  primaryBg: "#EFF6FF",
  altRowBg: "#F9FAFB",
  headingText: "#111827",
  bodyText: "#374151",
  mutedText: "#6B7280",
  borderColor: "#E5E7EB",
  white: "#FFFFFF",
  coverGradientTop: "#1E3A8A",
  coverGradientBottom: "#1E40AF",
  accent: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
};

export type PdfTheme = typeof DEFAULT_THEME;

// ===== SANITIZATION =====
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

    if (/^#{1}\s+/.test(line) && !line.startsWith("##")) {
      elements.push({ type: "h1", text: sanitizeForPdf(line.replace(/^#\s+/, "")) });
      i++; continue;
    }
    if (/^#{2}\s+/.test(line) && !line.startsWith("###")) {
      elements.push({ type: "h2", text: sanitizeForPdf(line.replace(/^##\s+/, "")) });
      i++; continue;
    }
    if (/^#{3}\s+/.test(line) && !line.startsWith("####")) {
      elements.push({ type: "h3", text: sanitizeForPdf(line.replace(/^###\s+/, "")) });
      i++; continue;
    }
    if (/^#{4}\s+/.test(line)) {
      elements.push({ type: "h3", text: sanitizeForPdf(line.replace(/^####\s+/, "")) });
      i++; continue;
    }
    if (/^---+$/.test(line) || /^={3,}$/.test(line)) {
      elements.push({ type: "hr" });
      i++; continue;
    }
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(sanitizeForPdf(lines[i].trimEnd()));
        i++;
      }
      i++;
      elements.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }
    if (line.startsWith("|")) {
      const headers: string[] = [];
      const rows: string[][] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|")
          .filter(c => c.trim() !== "")
          .map(c => sanitizeForPdf(c.trim().replace(/\*\*/g, "")));

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
    if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? Math.min(Math.floor(indentMatch[1].length / 2), 3) : 0;
      const clean = line.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "");
      elements.push({ type: "bullet", text: sanitizeForPdf(clean.replace(/\*\*/g, "")), indent });
      i++; continue;
    }
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
const CONTENT_WIDTH = 595.28 - (MARGIN * 2);

async function buildPdfBuffer(
  content: string,
  theme: PdfTheme = DEFAULT_THEME,
  author: string = "",
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.info["Producer"] = "KarmaBoard - Karma Space AI";
  if (author) {
    doc.info["Author"] = author;
  }

  const elements = parseMarkdown(content);
  if (elements.length === 0) {
    doc.fontSize(11).font("Helvetica").fillColor(theme.bodyText)
      .text("No content to render.", { width: CONTENT_WIDTH });
    doc.end();
    await new Promise<void>((resolve) => doc.on("end", resolve));
    return Buffer.concat(buffers);
  }

  const firstH1 = elements.find(e => e.type === "h1");
  const docTitle = firstH1 ? (firstH1 as { type: "h1"; text: string }).text : "Document";
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Cover header
  const barHeight = 100;
  doc.save();
  doc.rect(0, 0, 595.28, barHeight).fill(theme.coverGradientTop);
  doc.rect(0, barHeight, 595.28, 4).fill(theme.primaryLight);
  doc.restore();

  doc.fontSize(22).font("Helvetica-Bold").fillColor(theme.white)
    .text(docTitle, MARGIN, 22, { width: CONTENT_WIDTH });

  doc.fontSize(9).font("Helvetica").fillColor("#93C5FD")
    .text("Generated by KarmaBoard AI  |  " + generatedDate + (author ? "  |  Prepared by " + author : ""), MARGIN, 58, { width: CONTENT_WIDTH });

  doc.moveTo(MARGIN, 80).lineTo(MARGIN + CONTENT_WIDTH, 80).stroke("#60A5FA");
  doc.fillColor(theme.bodyText);

  doc.y = barHeight + 24;
  let skipFirstH1 = !!firstH1;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > 780) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, 595.28, 3).fill(theme.primary);
      doc.restore();
      doc.y = 18;
    }
  };

  const calculateColumnWidths = (headers: string[], rows: string[][], colCount: number): number[] => {
    const maxLenPerCol: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const headerLen = (headers[c] || "").length;
      const maxRowLen = rows.reduce((max, row) => Math.max(max, (row[c] || "").length), 0);
      maxLenPerCol.push(Math.max(headerLen * 1.1, maxRowLen, 8));
    }
    const totalLen = maxLenPerCol.reduce((a, b) => a + b, 0);
    return maxLenPerCol.map(len => Math.max(60, (len / totalLen) * CONTENT_WIDTH));
  };

  const renderTable = (headers: string[], rows: string[][]) => {
    if (headers.length === 0) return;

    const colCount = Math.max(headers.length, ...rows.map(r => r.length));
    const colWidths = calculateColumnWidths(headers, rows, colCount);
    const cellPadding = 6;
    const fontSize = 8;
    const headerFontSize = 8.5;

    const headerHeight = headerFontSize + (cellPadding * 2) + 4;

    ensureSpace(Math.min(200, 200));

    const tableX = MARGIN;
    let y = doc.y;

    doc.save();
    doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).fill(theme.primaryBg);
    doc.rect(tableX, y, 3, headerHeight).fill(theme.primaryLight);
    doc.restore();

    doc.save();
    doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).stroke(theme.borderColor);
    let xPos = tableX;
    for (let c = 0; c < colCount - 1; c++) {
      xPos += colWidths[c];
      doc.moveTo(xPos, y).lineTo(xPos, y + headerHeight).stroke(theme.borderColor);
    }
    doc.restore();

    doc.fillColor(theme.primary);
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

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isAlt = r % 2 === 1;

      let rowHeight = fontSize + (cellPadding * 2);
      for (let c = 0; c < colCount; c++) {
        const cellText = row[c] || "";
        const h = doc.heightOfString(cellText, { width: colWidths[c] - (cellPadding * 2), fontSize });
        rowHeight = Math.max(rowHeight, h + (cellPadding * 2));
      }

      if (y + rowHeight > 780) {
        doc.save();
        doc.moveTo(tableX, y).lineTo(tableX + CONTENT_WIDTH, y).stroke(theme.borderColor);
        doc.restore();
        doc.addPage();
        doc.save();
        doc.rect(0, 0, 595.28, 3).fill(theme.primary);
        doc.restore();
        y = 18;

        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).fill(theme.primaryBg);
        doc.rect(tableX, y, 3, headerHeight).fill(theme.primaryLight);
        doc.restore();
        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).stroke(theme.borderColor);
        let xPos2 = tableX;
        for (let c = 0; c < colCount - 1; c++) {
          xPos2 += colWidths[c];
          doc.moveTo(xPos2, y).lineTo(xPos2, y + headerHeight).stroke(theme.borderColor);
        }
        doc.restore();
        doc.fillColor(theme.primary);
        let cellX2 = tableX;
        for (let c = 0; c < colCount; c++) {
          doc.fontSize(headerFontSize).font("Helvetica-Bold")
            .text(headers[c] || "", cellX2 + cellPadding, y + cellPadding + 1, {
              width: colWidths[c] - (cellPadding * 2),
              height: headerHeight,
            });
          cellX2 += colWidths[c];
        }
        y += headerHeight;
      }

      if (isAlt) {
        doc.save();
        doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).fill(theme.altRowBg);
        doc.restore();
      }

      doc.save();
      doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).stroke(theme.borderColor);
      let xPos3 = tableX;
      for (let c = 0; c < colCount - 1; c++) {
        xPos3 += colWidths[c];
        doc.moveTo(xPos3, y).lineTo(xPos3, y + rowHeight).stroke(theme.borderColor);
      }
      doc.restore();

      doc.fillColor(theme.bodyText);
      let cellX3 = tableX;
      for (let c = 0; c < colCount; c++) {
        doc.fontSize(fontSize).font("Helvetica")
          .text(row[c] || "", cellX3 + cellPadding, y + cellPadding, {
            width: colWidths[c] - (cellPadding * 2),
            height: rowHeight,
          });
        cellX3 += colWidths[c];
      }

      y += rowHeight;
    }

    doc.y = y + 8;
  };

  // Render elements
  for (const el of elements) {
    try {
      switch (el.type) {
        case "h1": {
          if (skipFirstH1) { skipFirstH1 = false; break; }
          ensureSpace(50);
          doc.moveDown(0.6);
          const h1Y = doc.y;
          doc.save();
          doc.rect(MARGIN, h1Y, 4, 22).fill(theme.primary);
          doc.restore();
          doc.fontSize(18).font("Helvetica-Bold").fillColor(theme.headingText)
            .text(el.text, MARGIN + 12, h1Y + 2, { width: CONTENT_WIDTH - 12 });
          doc.moveDown(0.15);
          doc.save();
          doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke(theme.borderColor);
          doc.restore();
          doc.moveDown(0.4);
          break;
        }
        case "h2": {
          ensureSpace(40);
          doc.moveDown(0.5);
          const h2Y = doc.y;
          doc.save();
          doc.rect(MARGIN, h2Y, 3, 16).fill(theme.primaryLight);
          doc.restore();
          doc.fontSize(14).font("Helvetica-Bold").fillColor(theme.headingText)
            .text(el.text, MARGIN + 10, h2Y + 1, { width: CONTENT_WIDTH - 10 });
          doc.moveDown(0.1);
          doc.save();
          doc.moveTo(MARGIN + 10, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
            .strokeColor(theme.borderColor).lineWidth(0.5).stroke();
          doc.restore();
          doc.moveDown(0.35);
          break;
        }
        case "h3": {
          ensureSpace(30);
          doc.moveDown(0.35);
          doc.fontSize(11.5).font("Helvetica-Bold").fillColor(theme.primary)
            .text(el.text, { width: CONTENT_WIDTH });
          doc.moveDown(0.2);
          break;
        }
        case "bullet": {
          ensureSpace(18);
          const bulletX = MARGIN + (el.indent * 16);
          const bulletColor = el.indent === 0 ? theme.primaryLight : theme.mutedText;
          doc.save();
          doc.circle(bulletX + 2, doc.y + 5, 2).fill(bulletColor);
          doc.restore();
          doc.fontSize(9.5).font("Helvetica").fillColor(theme.bodyText)
            .text(el.text, bulletX + 10, doc.y - 2, {
              width: CONTENT_WIDTH - (el.indent * 16) - 10,
              lineGap: 1.5,
            });
          doc.moveDown(0.15);
          break;
        }
        case "normal": {
          ensureSpace(20);
          doc.fontSize(9.5).font("Helvetica").fillColor(theme.bodyText)
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
          const codeLines = el.text.split("\n");
          const codeHeight = codeLines.length * 12 + 16;
          const codeY = doc.y;

          if (codeY + Math.min(codeHeight, 300) > 780) {
            doc.addPage();
            doc.save();
            doc.rect(0, 0, 595.28, 3).fill(theme.primary);
            doc.restore();
            doc.y = 18;
          }

          const finalCodeY = doc.y;
          const finalCodeHeight = Math.min(codeHeight, 760 - finalCodeY);
          doc.save();
          doc.rect(MARGIN, finalCodeY, CONTENT_WIDTH, finalCodeHeight).fill("#F3F4F6");
          doc.rect(MARGIN, finalCodeY, 3, finalCodeHeight).fill(theme.mutedText);
          doc.restore();

          doc.fontSize(8).font("Courier").fillColor(theme.bodyText)
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
            .strokeColor(theme.borderColor).lineWidth(0.5).stroke();
          doc.restore();
          doc.moveDown(0.5);
          break;
        }
      }
    } catch (elErr) {
      console.error("[generate-pdf] Error rendering element:", elErr instanceof Error ? elErr.message : elErr);
    }
  }

  // Page numbers
  try {
    const internalDoc = doc as unknown as { bufferedPages: unknown[] };
    const pageCount = internalDoc.bufferedPages?.length || 1;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font("Helvetica").fillColor(theme.mutedText)
        .text(
          "Page " + (i + 1) + " of " + pageCount,
          MARGIN,
          doc.page.height - 30,
          { width: CONTENT_WIDTH, align: "center" }
        );
    }
  } catch (pageErr) {
    console.error("[generate-pdf] Page numbering failed (non-fatal):", pageErr);
  }

  doc.fillColor(theme.bodyText);
  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));
  return Buffer.concat(buffers);
}

/**
 * Generate a PDF buffer from markdown content.
 * Optionally accepts a projectId to fetch project-specific theme colors.
 */
export async function generatePdfBufferFromContent(
  content: string,
  projectId?: string,
): Promise<Buffer> {
  let theme: PdfTheme = DEFAULT_THEME;

  // If projectId provided, fetch project-specific theme
  if (projectId) {
    try {
      const { getTursoClient } = await import("@/lib/api-auth");
      const client = getTursoClient();
      const result = await client.execute({
        sql: 'SELECT value FROM "Settings" WHERE key = ?',
        args: ["PROJECT_THEME:" + projectId],
      });
      if (result.rows.length > 0) {
        const parsed = JSON.parse(result.rows[0].value as string);
        // If theme has primaryColor, use it
        if (parsed.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(parsed.primaryColor)) {
          theme = {
            ...DEFAULT_THEME,
            primary: parsed.primaryColor,
            coverGradientTop: parsed.primaryColor,
            coverGradientBottom: parsed.primaryColor,
          };
        }
        // If theme has colors array, use first color
        if (parsed.colors && Array.isArray(parsed.colors) && parsed.colors.length > 0) {
          const firstColor = parsed.colors[0];
          if (/^#[0-9A-Fa-f]{6}$/.test(firstColor)) {
            theme = {
              ...DEFAULT_THEME,
              primary: firstColor,
              coverGradientTop: firstColor,
              coverGradientBottom: firstColor,
            };
          }
        }
      }
    } catch (themeErr) {
      console.error("[generatePdfBufferFromContent] Theme fetch error:", themeErr);
    }
  }

  return buildPdfBuffer(content, theme);
}

/**
 * Generate a PDF as base64 string from markdown content.
 * Optionally accepts a projectId to fetch project-specific theme colors.
 */
export async function generatePdfBase64(
  content: string,
  projectId?: string,
): Promise<string> {
  const buffer = await generatePdfBufferFromContent(content, projectId);
  return buffer.toString("base64");
}
