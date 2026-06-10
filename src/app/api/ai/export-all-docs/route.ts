import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import PDFDocument from "pdfkit";

interface RouteContext {
  params: Promise<{}>;
}

// Extend timeout for bulk PDF generation
export const maxDuration = 60;

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

type PdfTheme = typeof DEFAULT_THEME;

// ===== SANITIZATION =====
function sanitizeForPdf(text: string): string {
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, "").replace(/[^\x20-\x7E\xA1-\xFF]/g, "").trim();
}

// ===== MARKDOWN PARSER (structured — supports tables) =====
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
    // Table — collect all consecutive | lines into a structured table element
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

// ===== Document type keyword signatures =====
const DOC_SIGNATURES = [
  {
    label: "Project Overview & PRD",
    keywords: ["Product Requirements Document", "Executive Summary", "Feature Requirements", "User Stories", "Target Audience", "Product Vision", "Non-Functional Requirements", "Scope & Constraints", "Risks & Mitigations"],
  },
  {
    label: "Technical Requirements Document",
    keywords: ["Technical Requirements Document", "Architecture Overview", "Technology Stack", "API Specification", "Security Requirements", "Performance Requirements", "Deployment & Infrastructure", "Testing Strategy"],
  },
  {
    label: "Application Flow Document",
    keywords: ["Application Flow Document", "User Journey", "Screen Flow", "Navigation Architecture", "State Management", "Interaction Patterns", "Data Flow", "Error Handling & Edge Cases"],
  },
  {
    label: "UI/UX Design Brief",
    keywords: ["UI/UX Design Brief", "Design Principles", "Design System", "Color Palette", "Typography", "Component Guidelines", "Motion & Animation", "Accessibility", "Dark Mode Strategy"],
  },
  {
    label: "Backend Schema Document",
    keywords: ["Backend Schema Document", "Entity Relationship", "Schema Definitions", "Enum Types", "Data Integrity Rules", "Seed Data", "Migration Strategy", "API-Database Mapping"],
  },
  {
    label: "Implementation Plan",
    keywords: ["Implementation Plan", "Phase Breakdown", "Task Breakdown", "Sprint Planning", "Resource Requirements", "Dependency Map", "Risk Register", "Quality Gates", "Deployment Plan", "Success Metrics"],
  },
];

function countKeywordMatches(content: string, keywords: string[]): number {
  const lower = content.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

function detectDocumentMessages(messages: { id: string; role: string; content: string; timestamp: string }[]) {
  const MIN_CONTENT_LENGTH = 1500;
  const MIN_KEYWORD_MATCHES = 3;

  const docMessages = messages.filter((msg) => {
    if (msg.role !== "assistant") return false;
    if (msg.content.length < MIN_CONTENT_LENGTH) return false;
    return DOC_SIGNATURES.some(sig => countKeywordMatches(msg.content, sig.keywords) >= MIN_KEYWORD_MATCHES);
  });

  return docMessages.slice(-6);
}

// ===== TABLE RENDERER =====
const MARGIN = 50;
const CONTENT_WIDTH = 595.28 - (MARGIN * 2);

function calculateColumnWidths(headers: string[], rows: string[][], colCount: number): number[] {
  const maxLenPerCol: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const headerLen = (headers[c] || "").length;
    const maxRowLen = rows.reduce((max, row) => Math.max(max, (row[c] || "").length), 0);
    maxLenPerCol.push(Math.max(headerLen * 1.1, maxRowLen, 8));
  }
  const totalLen = maxLenPerCol.reduce((a, b) => a + b, 0);
  return maxLenPerCol.map(len => Math.max(60, (len / totalLen) * CONTENT_WIDTH));
}

function renderTableOnDoc(doc: PDFDocument, headers: string[], rows: string[][], theme: PdfTheme) {
  if (headers.length === 0) return;

  const colCount = Math.max(headers.length, ...rows.map(r => r.length));
  const colWidths = calculateColumnWidths(headers, rows, colCount);
  const cellPadding = 6;
  const fontSize = 8;
  const headerFontSize = 8.5;
  const headerHeight = headerFontSize + (cellPadding * 2) + 4;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > 780) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, 595.28, 3).fill(theme.primary);
      doc.restore();
      doc.y = 18;
    }
  };

  ensureSpace(200);

  const tableX = MARGIN;
  let y = doc.y;

  // Header background
  doc.save();
  doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).fill(theme.primaryBg);
  doc.rect(tableX, y, 3, headerHeight).fill(theme.primaryLight);
  doc.restore();

  // Header borders + vertical lines
  doc.save();
  doc.rect(tableX, y, CONTENT_WIDTH, headerHeight).stroke(theme.borderColor);
  let xPos = tableX;
  for (let c = 0; c < colCount - 1; c++) {
    xPos += colWidths[c];
    doc.moveTo(xPos, y).lineTo(xPos, y + headerHeight).stroke(theme.borderColor);
  }
  doc.restore();

  // Header text
  doc.fillColor(theme.primary);
  let cellX = tableX;
  for (let c = 0; c < colCount; c++) {
    doc.fontSize(headerFontSize).font("Helvetica-Bold")
      .text(headers[c] || "", cellX + cellPadding, y + cellPadding + 1, {
        width: colWidths[c] - (cellPadding * 2),
        height: headerHeight,
      });
    cellX += colWidths[c];
  }
  y += headerHeight;

  // Rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isAlt = r % 2 === 1;

    let rowHeight = fontSize + (cellPadding * 2);
    for (let c = 0; c < colCount; c++) {
      const h = doc.heightOfString(row[c] || "", { width: colWidths[c] - (cellPadding * 2), fontSize });
      rowHeight = Math.max(rowHeight, h + (cellPadding * 2));
    }

    // Page break mid-table: redraw header
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

    // Alternating row background
    if (isAlt) {
      doc.save();
      doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).fill(theme.altRowBg);
      doc.restore();
    }

    // Row border + vertical lines
    doc.save();
    doc.rect(tableX, y, CONTENT_WIDTH, rowHeight).stroke(theme.borderColor);
    let xPos3 = tableX;
    for (let c = 0; c < colCount - 1; c++) {
      xPos3 += colWidths[c];
      doc.moveTo(xPos3, y).lineTo(xPos3, y + rowHeight).stroke(theme.borderColor);
    }
    doc.restore();

    // Row text
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
}

// ===== DOCUMENT CONTENT RENDERER =====
function renderDocumentContent(doc: PDFDocument, content: string, theme: PdfTheme, skipFirstH1: boolean) {
  const elements = parseMarkdown(content);
  let didSkipFirst = false;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > 780) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, 595.28, 3).fill(theme.primary);
      doc.restore();
      doc.y = 18;
    }
  };

  for (const el of elements) {
    try {
      switch (el.type) {
        case "h1": {
          if (skipFirstH1 && !didSkipFirst) { didSkipFirst = true; break; }
          ensureSpace(50);
          doc.moveDown(0.6);
          const y1 = doc.y;
          doc.save();
          doc.rect(MARGIN, y1, 4, 22).fill(theme.primary);
          doc.restore();
          doc.fontSize(18).font("Helvetica-Bold").fillColor(theme.headingText)
            .text(el.text, MARGIN + 12, y1 + 2, { width: CONTENT_WIDTH - 12 });
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
          const y2 = doc.y;
          doc.save();
          doc.rect(MARGIN, y2, 3, 16).fill(theme.primaryLight);
          doc.restore();
          doc.fontSize(14).font("Helvetica-Bold").fillColor(theme.headingText)
            .text(el.text, MARGIN + 10, y2 + 1, { width: CONTENT_WIDTH - 10 });
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
          renderTableOnDoc(doc, el.headers, el.rows, theme);
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
      console.error("[export-all-docs] Error rendering element:", elErr instanceof Error ? elErr.message : elErr);
    }
  }
}

// ===== Generate combined PDF =====
async function generateCombinedPdf(
  documents: { title: string; content: string; timestamp: string }[],
  projectName: string,
  theme: PdfTheme = DEFAULT_THEME,
  superAdminName: string = "",
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.info["Title"] = `${projectName} - All Documents`;
  doc.info["Producer"] = "KarmaBoard - Karma Space AI";
  if (superAdminName) {
    doc.info["Author"] = superAdminName;
  }

  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ===== COVER PAGE =====
  const coverHeight = 320;
  doc.save();
  doc.rect(0, 0, 595.28, coverHeight).fill(theme.coverGradientTop);
  doc.rect(0, coverHeight, 595.28, 5).fill(theme.primaryLight);
  doc.rect(0, coverHeight + 5, 595.28, 2).fill("#60A5FA");
  doc.restore();

  doc.fontSize(28).font("Helvetica-Bold").fillColor(theme.white)
    .text(projectName, MARGIN, 60, { width: CONTENT_WIDTH });

  doc.fontSize(16).font("Helvetica").fillColor("#93C5FD")
    .text("Complete Documentation Package", MARGIN, 100, { width: CONTENT_WIDTH });

  doc.fontSize(11).font("Helvetica").fillColor("#BFDBFE")
    .text(`${documents.length} Document${documents.length !== 1 ? "s" : ""}`, MARGIN, 130, { width: CONTENT_WIDTH });

  doc.fontSize(9).font("Helvetica").fillColor("#93C5FD")
    .text(`Generated: ${generatedDate}`, MARGIN, 180, { width: CONTENT_WIDTH });
  if (superAdminName) {
    doc.text(`Prepared by: ${superAdminName}`, MARGIN, 195, { width: CONTENT_WIDTH });
  }
  doc.text("Powered by KarmaBoard", MARGIN, 215, { width: CONTENT_WIDTH });

  doc.moveTo(MARGIN, 250).lineTo(MARGIN + CONTENT_WIDTH, 250).stroke("#60A5FA");

  doc.fontSize(10).font("Helvetica-Bold").fillColor(theme.white)
    .text("Included Documents:", MARGIN, 265, { width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  for (let i = 0; i < documents.length; i++) {
    const docTitle = documents[i].title.length > 60 ? documents[i].title.slice(0, 57) + "..." : documents[i].title;
    doc.fontSize(9).font("Helvetica").fillColor("#BFDBFE")
      .text(`  ${i + 1}. ${docTitle}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.15);
  }

  // ===== CONTENT PAGES =====
  for (let docIdx = 0; docIdx < documents.length; docIdx++) {
    const { title, content } = documents[docIdx];

    if (docIdx > 0) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, 595.28, 4).fill(theme.primary);
      doc.rect(0, 4, 595.28, 1).fill(theme.primaryLight);
      doc.restore();
      doc.y = 20;
    }

    // Document title header
    doc.moveDown(0.5);
    const h1Y = doc.y;
    doc.save();
    doc.rect(MARGIN, h1Y, 4, 24).fill(theme.primary);
    doc.restore();
    doc.fontSize(20).font("Helvetica-Bold").fillColor(theme.headingText)
      .text(`Document ${docIdx + 1}: ${sanitizeForPdf(title)}`, MARGIN + 14, h1Y + 2, {
        width: CONTENT_WIDTH - 14,
      });
    doc.moveDown(0.2);
    doc.save();
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke(theme.primaryLight);
    doc.restore();
    doc.moveDown(0.8);

    // Render content with proper table support
    renderDocumentContent(doc, content, theme, true);

    // Separator between docs
    if (docIdx < documents.length - 1) {
      doc.moveDown(1);
      doc.save();
      doc.moveTo(MARGIN + 40, doc.y).lineTo(MARGIN + CONTENT_WIDTH - 40, doc.y)
        .strokeColor(theme.primaryLight).lineWidth(0.5).stroke();
      doc.restore();
      doc.moveDown(0.5);
    }
  }

  // ===== PAGE NUMBERS =====
  try {
    const internalDoc = doc as unknown as { bufferedPages: unknown[] };
    const pageCount = internalDoc.bufferedPages?.length || 1;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font("Helvetica").fillColor(theme.mutedText)
        .text(`Page ${i + 1} of ${pageCount}`, MARGIN, doc.page.height - 30, {
          width: CONTENT_WIDTH, align: "center",
        });
      const footerText = superAdminName
        ? `Prepared by ${superAdminName}  |  KarmaBoard`
        : "Generated by KarmaBoard";
      doc.fontSize(7).font("Helvetica").fillColor("#D1D5DB")
        .text(footerText, MARGIN, doc.page.height - 30, {
          width: CONTENT_WIDTH, align: "right",
        });
    }
  } catch (pageErr) {
    console.error("[export-all-docs] Page numbering failed (non-fatal):", pageErr);
  }

  doc.fillColor(theme.bodyText);
  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));
  return Buffer.concat(buffers);
}

// ===== API ROUTE =====
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

    console.log("[GET /api/ai/export-all-docs] Project:", projectId);

    const client = getTursoClient();
    const ip = getClientIp(request);

    // Fetch project name
    const projectResult = await client.execute({
      sql: 'SELECT name FROM "Project" WHERE id = ?',
      args: [projectId],
    });
    const projectName = projectResult.rows.length > 0
      ? (projectResult.rows[0].name as string)
      : "Project";

    // Fetch PDF theme
    let theme = { ...DEFAULT_THEME };
    try {
      const themeResult = await client.execute({
        sql: 'SELECT value FROM "Settings" WHERE key = ?',
        args: ["PDF_THEME"],
      });
      if (themeResult.rows.length > 0) {
        theme = { ...DEFAULT_THEME, ...JSON.parse(themeResult.rows[0].value as string) };
      }
    } catch { /* use defaults */ }

    // Fetch SUPERADMIN name
    let superAdminName = "";
    try {
      const adminResult = await client.execute({
        sql: 'SELECT name FROM "User" WHERE role = ? LIMIT 1',
        args: ["SUPERADMIN"],
      });
      if (adminResult.rows.length > 0) {
        superAdminName = sanitizeForPdf(adminResult.rows[0].name as string);
      }
    } catch { /* ignore */ }

    // ===== Try fetching from ProjectDocument table first =====
    let documents: { title: string; content: string; timestamp: string }[] = [];

    try {
      const storedDocs = await client.execute({
        sql: 'SELECT "docType", title, content, "updatedAt" FROM "ProjectDocument" WHERE "projectId" = ? ORDER BY "docType" ASC',
        args: [projectId],
      });

      if (storedDocs.rows.length > 0) {
        console.log("[GET /api/ai/export-all-docs] Using " + storedDocs.rows.length + " stored ProjectDocuments");
        documents = storedDocs.rows.map(row => ({
          title: (row.title as string) || (row.docType as string).toUpperCase() + " Document",
          content: (row.content as string),
          timestamp: (row.updatedAt as string),
        }));
      }
    } catch (storedErr) {
      console.error("[GET /api/ai/export-all-docs] Error fetching stored documents (falling back):", storedErr);
    }

    // ===== Fallback: detect from chat messages if no stored docs =====
    if (documents.length === 0) {
      const chatResult = await client.execute({
        sql: 'SELECT id, role, content, timestamp FROM "AiChat" WHERE "projectId" = ? AND role = ? ORDER BY "timestamp" ASC',
        args: [projectId, "assistant"],
      });

      if (chatResult.rows.length === 0) {
        return NextResponse.json({ success: false, error: "No messages found for this project" }, { status: 404 });
      }

      const allMessages = chatResult.rows.map(row => ({
        id: row.id as string,
        role: row.role as string,
        content: row.content as string,
        timestamp: row.timestamp as string,
      }));
      const docMessages = detectDocumentMessages(allMessages);

      if (docMessages.length === 0) {
        return NextResponse.json({ success: false, error: "No document messages found. Generate documents first using /docs, /prd, /trd, etc." }, { status: 404 });
      }

      console.log("[GET /api/ai/export-all-docs] Using " + docMessages.length + " detected document messages (fallback)");

      documents = docMessages.map(msg => {
        const firstLine = msg.content.split("\n").find(l => {
          const trimmed = l.trim();
          return trimmed.startsWith("#") && trimmed.length > 2;
        });
        const title = firstLine
          ? firstLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().slice(0, 80)
          : msg.content.split("\n")[0]?.slice(0, 80) || "Untitled Document";
        return { title, content: msg.content, timestamp: msg.timestamp };
      });
    }

    // Generate combined PDF with proper table rendering
    const pdfBuffer = await generateCombinedPdf(documents, projectName, theme, superAdminName);

    console.log(`[GET /api/ai/export-all-docs] PDF generated: ${pdfBuffer.length} bytes (${documents.length} docs)`);

    // Log activity
    await logActivity({
      userId: user.id,
      action: "EXPORT_ALL_DOCS_PDF",
      details: `Exported ${documents.length} documents as combined PDF for project: ${projectName}`,
      entity: "project",
      entityId: projectId,
      ipAddress: ip,
      tursoClient: client,
    });

    const safeFilename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}_All_Documents.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/export-all-docs] Error:", error);
    return NextResponse.json({
      success: false,
      error: `Failed to generate PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
