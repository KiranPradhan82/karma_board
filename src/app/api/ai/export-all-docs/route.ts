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

// ===== Document type keyword signatures =====
// Each document type has a set of unique section headings that identify it.
// A message must match at least 3 keywords from ONE signature to be classified as a document.
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

// Count how many keywords from a signature appear in the content (case-insensitive)
function countKeywordMatches(content: string, keywords: string[]): number {
  const lower = content.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

// ===== Detect the 6 generated document messages from chat history =====
// This ONLY matches the structured documents (PRD, TRD, Flow, UX, Schema, Plan),
// NOT general chat responses that happen to be long.
function detectDocumentMessages(messages: { id: string; role: string; content: string; timestamp: string }[]) {
  const MIN_CONTENT_LENGTH = 1500;
  const MIN_KEYWORD_MATCHES = 3; // Must match at least 3 section headings from one signature

  const docMessages = messages.filter((msg) => {
    if (msg.role !== "assistant") return false;
    if (msg.content.length < MIN_CONTENT_LENGTH) return false;

    // Check if this message matches any known document signature
    return DOC_SIGNATURES.some(sig => countKeywordMatches(msg.content, sig.keywords) >= MIN_KEYWORD_MATCHES);
  });

  // Limit to last 6 documents (most recent)
  return docMessages.slice(-6);
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

  // PDF metadata
  doc.info["Title"] = `${projectName} - All Documents`;
  doc.info["Producer"] = "KarmaBoard - Karma Space AI";
  if (superAdminName) {
    doc.info["Author"] = superAdminName;
  }

  const MARGIN = 50;
  const CONTENT_WIDTH = 595.28 - (MARGIN * 2);
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
  doc.y = coverHeight + 30;

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

    // Document title
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

    // Render content line by line
    const lines = content.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) { doc.moveDown(0.3); continue; }

      if (doc.y > 760) {
        doc.addPage();
        doc.save();
        doc.rect(0, 0, 595.28, 3).fill(theme.primary);
        doc.restore();
        doc.y = 18;
      }

      // H2
      if (/^#{2}\s+/.test(line) && !line.startsWith("###")) {
        doc.moveDown(0.5);
        const h2Y = doc.y;
        doc.save();
        doc.rect(MARGIN, h2Y, 3, 14).fill(theme.primaryLight);
        doc.restore();
        doc.fontSize(13).font("Helvetica-Bold").fillColor(theme.headingText)
          .text(sanitizeForPdf(line.replace(/^##\s+/, "")), MARGIN + 10, h2Y + 1, { width: CONTENT_WIDTH - 10 });
        doc.moveDown(0.3);
        continue;
      }

      // H3
      if (/^#{3}\s+/.test(line)) {
        doc.moveDown(0.3);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(theme.primary)
          .text(sanitizeForPdf(line.replace(/^###\s+/, "")), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.2);
        continue;
      }

      // HR
      if (/^---+$/.test(line) || /^={3,}$/.test(line)) {
        doc.moveDown(0.3);
        doc.save();
        doc.moveTo(MARGIN + 30, doc.y).lineTo(MARGIN + CONTENT_WIDTH - 30, doc.y)
          .strokeColor(theme.borderColor).lineWidth(0.5).stroke();
        doc.restore();
        doc.moveDown(0.3);
        continue;
      }

      // Table rows
      if (line.startsWith("|")) {
        const cells = line.split("|").filter(c => c.trim() !== "").map(c => sanitizeForPdf(c.trim().replace(/\*\*/g, "")));
        if (cells.every(c => /^[-:]+$/.test(c))) continue;
        const text = cells.join("  |  ");
        doc.fontSize(8).font("Courier").fillColor(theme.bodyText)
          .text(text, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10 });
        doc.moveDown(0.1);
        continue;
      }

      // Bullet / numbered list
      if (line.match(/^[-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? Math.min(Math.floor(indentMatch[1].length / 2), 3) : 0;
        const bulletX = MARGIN + (indent * 14);
        const clean = sanitizeForPdf(line.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "").replace(/\*\*/g, ""));
        doc.save();
        doc.circle(bulletX + 2, doc.y + 4, 1.5).fill(indent === 0 ? theme.primaryLight : theme.mutedText);
        doc.restore();
        doc.fontSize(9).font("Helvetica").fillColor(theme.bodyText)
          .text(clean, bulletX + 8, doc.y - 1, { width: CONTENT_WIDTH - (indent * 14) - 8, lineGap: 1 });
        doc.moveDown(0.12);
        continue;
      }

      // Code block marker
      if (line.startsWith("```")) continue;

      // Normal text
      const clean = sanitizeForPdf(line.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`([^`]+)`/g, "$1"));
      if (clean.length === 0) continue;
      doc.fontSize(9.5).font("Helvetica").fillColor(theme.bodyText)
        .text(clean, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2, paragraphGap: 2 });
      doc.moveDown(0.15);
    }

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

    // Generate combined PDF
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
