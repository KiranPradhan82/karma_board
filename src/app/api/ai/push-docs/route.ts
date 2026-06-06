import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getTursoClient, logActivity, getClientIp } from "@/lib/api-auth";
import { pushFile, pushBinaryFile, pushMultipleFiles } from "@/lib/github-client";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

async function getGitHubConfig(client: ReturnType<typeof getTursoClient>): Promise<{ repoUrl: string; token: string } | null> {
  try {
    const urlResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
      args: [],
    });
    const patResult = await client.execute({
      sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_PAT'`,
      args: [],
    });

    if (urlResult.rows.length === 0 || patResult.rows.length === 0) {
      return null;
    }

    const repoUrl = urlResult.rows[0].value as string;
    const encryptedPat = patResult.rows[0].value as string;

    let token: string;
    try {
      token = decrypt(encryptedPat);
    } catch {
      token = encryptedPat; // Not encrypted (legacy)
    }

    return { repoUrl, token };
  } catch {
    return null;
  }
}

// POST: Push a single document to GitHub
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, docType, content, commitMessage } = body;

    if (!projectId || !docType || !content) {
      return NextResponse.json({ success: false, error: "projectId, docType, and content are required" }, { status: 400 });
    }

    const client = getTursoClient();
    const githubConfig = await getGitHubConfig(client);

    if (!githubConfig) {
      return NextResponse.json({
        success: false,
        error: "GitHub not configured. Run /init to set up GitHub credentials.",
      }, { status: 400 });
    }

    const message = commitMessage || "docs: add " + docType + " document";

    // Push the markdown file
    const mdPath = "docs/pre-coding/" + docType + ".md";
    await pushFile(githubConfig, mdPath, content, message);

    // Check if there's a PDF for this document
    const pdfResult = await client.execute({
      sql: `SELECT "pdfData" FROM "ProjectDocument" WHERE "projectId" = ? AND "docType" = ? AND "pdfData" IS NOT NULL`,
      args: [projectId, docType],
    });

    if (pdfResult.rows.length > 0 && pdfResult.rows[0].pdfData) {
      const pdfPath = "docs/pre-coding/" + docType + ".pdf";
      await pushBinaryFile(githubConfig, pdfPath, pdfResult.rows[0].pdfData as string, message);
    }

    await logActivity({
      userId: user.id,
      action: "GITHUB_PUSH_DOC",
      details: "Pushed " + docType + " document to GitHub",
      entity: "project_document",
      entityId: projectId,
      ipAddress: getClientIp(request),
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: { path: mdPath, message },
    });
  } catch (error) {
    console.error("[POST /api/ai/push-docs] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to push to GitHub",
    }, { status: 500 });
  }
}

// POST /bulk: Push all documents for a project in one commit
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const githubConfig = await getGitHubConfig(client);

    if (!githubConfig) {
      return NextResponse.json({
        success: false,
        error: "GitHub not configured. Run /init to set up GitHub credentials.",
      }, { status: 400 });
    }

    // Fetch all documents
    const docsResult = await client.execute({
      sql: `SELECT "docType", content, "pdfData" FROM "ProjectDocument" WHERE "projectId" = ? ORDER BY "createdAt" ASC`,
      args: [projectId],
    });

    if (docsResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "No documents found for this project" }, { status: 404 });
    }

    // Build file entries
    const files: { path: string; content: string; isBinary?: boolean }[] = [];
    let pushedCount = 0;

    for (const row of docsResult.rows) {
      const docType = row.docType as string;
      if (row.content) {
        files.push({
          path: "docs/pre-coding/" + docType + ".md",
          content: row.content as string,
        });
        pushedCount++;
      }
      if (row.pdfData) {
        files.push({
          path: "docs/pre-coding/" + docType + ".pdf",
          content: row.pdfData as string,
          isBinary: true,
        });
        pushedCount++;
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No file content to push" }, { status: 400 });
    }

    // Also push all AI chat messages as documentation
    const chatResult = await client.execute({
      sql: `SELECT role, content FROM "AiChat" WHERE "projectId" = ? AND role = 'assistant' ORDER BY "timestamp" ASC`,
      args: [projectId],
    });

    // Push via Git Trees API for efficiency
    const result = await pushMultipleFiles(githubConfig, files, "docs: sync pre-coding documentation from KarmaBoard");

    await logActivity({
      userId: user.id,
      action: "GITHUB_PUSH_BULK",
      details: "Pushed " + pushedCount + " files to GitHub in one commit",
      entity: "project_document",
      entityId: projectId,
      ipAddress: getClientIp(request),
      tursoClient: client,
    });

    return NextResponse.json({
      success: true,
      data: {
        filesPushed: result.filesPushed,
        commitSha: result.commitSha,
      },
    });
  } catch (error) {
    console.error("[PUT /api/ai/push-docs] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to push to GitHub",
    }, { status: 500 });
  }
}
