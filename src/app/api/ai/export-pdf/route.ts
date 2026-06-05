import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireRole } from "@/lib/api-auth";
import PDFDocument from "pdfkit";

interface RouteContext {
  params: Promise<{}>;
}

// Extend Vercel serverless timeout — PDF generation can take a while for large docs
export const maxDuration = 30;

// Strip ALL characters that pdfkit's Helvetica (WinAnsiEncoding) can't render.
// Helvetica only supports: U+0020-U+007E (ASCII), U+00A1-U+00FF (Latin-1 supplement),
// and a handful of typographic symbols. Everything else (Devanagari, CJK, Cyrillic extended,
// emoji, combining marks, etc.) must be removed or replaced to prevent encoding crashes.
function sanitizeForPdf(text: string): string {
  return text
    // Remove supplementary planes (U+10000+) — CJK Ext-B, emoji, rare scripts
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    // Remove non-Latin-1 BMP ranges that Helvetica cannot encode:
    //   U+0080-U+00A0  — control chars, NBSP, soft hyphen
    //   U+0100-U+024F  — Latin Extended-A/B (accents outside Latin-1)
    //   U+0250-U+02AF  — IPA Extensions
    //   U+0300-U+036F  — Combining Diacritical Marks
    //   U+0370-U+04FF  — Greek & Cyrillic
    //   U+0500-U+052F  — Cyrillic Supplement
    //   U+0530-U+058F  — Armenian
    //   U+0590-U+05FF  — Hebrew
    //   U+0600-U+06FF  — Arabic
    //   U+0700-U+074F  — Syriac
    //   U+0750-U+077F  — Arabic Supplement
    //   U+0780-U+07BF  — Thaana
    //   U+07C0-U+07FF  — NKo
    //   U+0800-U+083F  — Samaritan
    //   U+0840-U+08FF  — Mandaic, Arabic Extended-A
    //   U+0900-U+097F  — Devanagari
    //   U+0980-U+09FF  — Bengali
    //   U+0A00-U+0A7F  — Gurmukhi
    //   U+0A80-U+0AFF  — Gujarati
    //   U+0B00-U+0B7F  — Oriya
    //   U+0B80-U+0BFF  — Tamil
    //   U+0C00-U+0C7F  — Telugu
    //   U+0C80-U+0CFF  — Kannada
    //   U+0D00-U+0D7F  — Malayalam
    //   U+0D80-U+0DFF  — Sinhala
    //   U+0E00-U+0E7F  — Thai
    //   U+0E80-U+0EFF  — Lao
    //   U+0F00-U+0FFF  — Tibetan
    //   U+1000-U+109F  — Myanmar
    //   U+10A0-U+10FF  — Georgian
    //   U+1100-U+11FF  — Hangul Jamo
    //   U+1200-U+137F  — Ethiopic
    //   U+1380-U+139F  — Ethiopic Supplement
    //   U+1400-U+167F  — Unified Canadian Aboriginal Syllabics
    //   U+1680-U+169F  — Ogham
    //   U+16A0-U+16FF  — Runic
    //   U+1700-U+177F  — Tagalog, Hanunoo, Buhid, Tagbanwa
    //   U+1780-U+17FF  — Khmer
    //   U+1800-U+18AF  — Mongolian
    //   U+1900-U+194F  — Limbu, Tai Le
    //   U+1950-U+197F  — New Tai Lue
    //   U+1980-U+19DF  — Tai Tham
    //   U+19E0-U+19FF  — Khmer Symbols
    //   U+1A00-U+1A9F  — Buginese, Tai Tham Extended
    //   U+1B00-U+1B7F  — Balinese, Sundanese
    //   U+1D00-U+1D7F  — Phonetic Extensions
    //   U+1E00-U+1EFF  — Latin Extended Additional
    //   U+1F00-U+1FFF  — Greek Extended
    //   U+2000-U+206F  — General Punctuation (keep safe subset)
    //   U+2070-U+209F  — Superscripts/Subscripts
    //   U+20A0-U+20CF  — Currency Symbols
    //   U+20D0-U+20FF  — Combining Diacritical Marks for Symbols
    //   U+2100-U+214F  — Letterlike Symbols
    //   U+2150-U+218F  — Number Forms
    //   U+2190-U+21FF  — Arrows
    //   U+2200-U+22FF  — Mathematical Operators
    //   U+2300-U+23FF  — Misc Technical
    //   U+2400-U+243F  — Control Pictures
    //   U+2440-U+245F  — OCR
    //   U+2460-U+24FF  — Enclosed Alphanumerics
    //   U+2500-U+257F  — Box Drawing
    //   U+2580-U+259F  — Block Elements
    //   U+25A0-U+25FF  — Geometric Shapes
    //   U+2600-U+26FF  — Misc Symbols
    //   U+2700-U+27BF  — Dingbats
    //   U+3000-U+303F  — CJK Symbols
    //   U+3040-U+309F  — Hiragana
    //   U+30A0-U+30FF  — Katakana
    //   U+3100-U+312F  — Bopomofo
    //   U+3130-U+318F  — Hangul Compatibility Jamo
    //   U+3190-U+319F  — Kanbun
    //   U+31A0-U+31BF  — Bopomofo Extended
    //   U+31C0-U+31EF  — CJK Strokes
    //   U+31F0-U+31FF  — Katakana Phonetic Extensions
    //   U+3200-U+32FF  — Enclosed CJK Letters/Months
    //   U+3300-U+33FF  — CJK Compatibility
    //   U+3400-U+4DBF  — CJK Unified Ideographs Extension A
    //   U+4DC0-U+4DFF  — Yijing Hexagram Symbols
    //   U+4E00-U+9FFF  — CJK Unified Ideographs
    //   U+A000-U+A4CF  — Yi Syllables/Radicals
    //   U+AC00-U+D7AF  — Hangul Syllables
    //   U+D800-U+DFFF  — Surrogates
    //   U+E000-U+F8FF  — Private Use Area
    //   U+F900-U+FAFF  — CJK Compatibility Ideographs
    //   U+FB00-U+FB4F  — Alphabetic Presentation Forms (Arabic/Latin)
    //   U+FE00-U+FE0F  — Variation Selectors
    //   U+FE20-U+FE2F  — Combining Half Marks
    //   U+FE30-U+FE4F  — CJK Compatibility Forms
    //   U+FE50-U+FE6F  — Small Form Variants
    //   U+FE70-U+FEFF  — Arabic Presentation Forms-B
    //   U+FF00-U+FFEF  — Halfwidth/Fullwidth Forms
    //   U+FFF0-U+FFFD  — Specials
    // Bulk-remove everything outside WinAnsi safe range (U+0020-U+007E + U+00A1-U+00FF)
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "")
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

  let linesRendered = 0;
  let linesSkipped = 0;
  for (const { text, style } of parsedLines) {
    try {
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
      linesRendered++;
    } catch (lineErr) {
      // Per-line error: skip this line but keep rendering the rest
      linesSkipped++;
      console.error(`[export-pdf] Skipped line ${linesRendered + linesSkipped}:`, lineErr instanceof Error ? lineErr.message : lineErr);
    }
  }

  if (linesSkipped > 0) {
    console.warn(`[export-pdf] Skipped ${linesSkipped} of ${parsedLines.length} lines due to rendering errors`);
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
