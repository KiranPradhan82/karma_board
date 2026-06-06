import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient } from "@/lib/api-auth";
import { chatCompletion } from "@/lib/ai-client";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, trdContent } = body;

    if (!projectId || !trdContent || typeof trdContent !== "string") {
      return NextResponse.json({ success: false, error: "projectId and trdContent are required" }, { status: 400 });
    }

    // Use AI to extract theme data from the TRD
    const themePrompt = 'Analyze the following Technical Requirements Document (TRD) and extract theme/design-related settings. Return ONLY a JSON object with these fields (use null for fields you cannot determine):\n\n' +
      '{\n' +
      '  "primaryColor": "#hex or null",\n' +
      '  "secondaryColor": "#hex or null",\n' +
      '  "accentColor": "#hex or null",\n' +
      '  "fontFamily": "font name or null",\n' +
      '  "logoDescription": "description or null",\n' +
      '  "brandStyle": "style description or null"\n' +
      '}\n\n' +
      'Focus on:\n' +
      '1. Any colors mentioned for primary, secondary, or accent usage\n' +
      '2. Typography preferences (font families, font names)\n' +
      '3. Logo/branding descriptions\n' +
      '4. Overall brand style descriptors (modern, minimal, corporate, playful, etc.)\n\n' +
      'If no specific colors are mentioned, try to infer them from the brand style description.\n' +
      'Return ONLY the JSON object, no explanation.\n\n' +
      'TRD content:\n' + trdContent.slice(0, 8000);

    const aiResult = await chatCompletion({
      model: "glm-4-flash",
      messages: [
        { role: "system", content: "You are a design system analyzer. Extract theme information from technical documents. Return only valid JSON." },
        { role: "user", content: themePrompt },
      ],
      maxTokens: 500,
    });

    if (!aiResult.success || !aiResult.content) {
      return NextResponse.json({ success: false, error: "Failed to extract theme from TRD: " + (aiResult.error || "AI returned no content") }, { status: 500 });
    }

    // Parse the JSON response
    let themeData: Record<string, unknown>;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = aiResult.content.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      themeData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[extract-theme] Failed to parse AI response:", aiResult.content);
      return NextResponse.json({ success: false, error: "Failed to parse theme data from AI response" }, { status: 500 });
    }

    // Save to Settings
    const client = getTursoClient();
    const settingsKey = "PROJECT_THEME:" + projectId;

    // Upsert the theme setting
    const existing = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = ?`,
      args: [settingsKey],
    });

    if (existing.rows.length > 0) {
      await client.execute({
        sql: `UPDATE "Settings" SET value = ?, "updatedAt" = datetime('now') WHERE key = ?`,
        args: [JSON.stringify(themeData), settingsKey],
      });
    } else {
      await client.execute({
        sql: `INSERT INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
        args: [settingsKey, JSON.stringify(themeData)],
      });
    }

    // Also update the global PDF_THEME if colors are specified
    if (themeData.primaryColor || themeData.secondaryColor || themeData.accentColor) {
      const themeOverrides: Record<string, unknown> = {};
      if (themeData.primaryColor) themeOverrides.primary = themeData.primaryColor;
      if (themeData.secondaryColor) themeOverrides.primaryLight = themeData.secondaryColor;
      if (themeData.accentColor) themeOverrides.accent = themeData.accentColor;

      const existingPdfTheme = await client.execute({
        sql: `SELECT value FROM "Settings" WHERE key = 'PDF_THEME'`,
        args: [],
      });

      if (existingPdfTheme.rows.length > 0) {
        // Merge with existing PDF_THEME
        try {
          const current = JSON.parse(existingPdfTheme.rows[0].value as string);
          const merged = { ...current, ...themeOverrides };
          await client.execute({
            sql: `UPDATE "Settings" SET value = ?, "updatedAt" = datetime('now') WHERE key = 'PDF_THEME'`,
            args: [JSON.stringify(merged)],
          });
        } catch {
          // If parse fails, just set the overrides
          await client.execute({
            sql: `UPDATE "Settings" SET value = ?, "updatedAt" = datetime('now') WHERE key = 'PDF_THEME'`,
            args: [JSON.stringify(themeOverrides)],
          });
        }
      } else {
        await client.execute({
          sql: `INSERT INTO "Settings" (key, value, "updatedAt") VALUES ('PDF_THEME', ?, datetime('now'))`,
          args: [JSON.stringify(themeOverrides)],
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: themeData,
    });
  } catch (error) {
    console.error("[POST /api/ai/extract-theme] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
