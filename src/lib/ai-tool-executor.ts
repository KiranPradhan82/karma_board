/**
 * AI Tool Executor for Agentic Karma Space
 *
 * Executes tool calls from the AI against the KarmaBoard database.
 * Each tool function performs proper RBAC checks and returns structured results.
 */

import type { AiToolCall, AiToolResult } from "./ai-tools";
import { encrypt, decrypt } from "./encryption";

interface ExecutorContext {
  userId: string;
  userRole: string;
  userName: string;
  tursoClient: ReturnType<typeof import("@/lib/api-auth").getTursoClient>;
}

// ===== Tool: create_project =====

async function createProject(
  args: { name: string; description?: string; priority?: string; deadline?: string; color?: string; clientName?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userId, userRole } = ctx;

  // RBAC: ADMIN+ or SUPERADMIN only
  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "",
      toolName: "create_project",
      success: false,
      result: "Permission denied: Only ADMIN and SUPERADMIN can create projects.",
      displayMessage: "Permission denied — only admins can create projects.",
    };
  }

  // Validate
  if (!args.name || args.name.trim().length === 0) {
    return {
      toolCallId: "",
      toolName: "create_project",
      success: false,
      result: "Project name is required.",
      displayMessage: "Missing project name.",
    };
  }

  if (args.name.length > 100) {
    return {
      toolCallId: "",
      toolName: "create_project",
      success: false,
      result: "Project name must be 100 characters or less.",
      displayMessage: "Project name is too long (max 100 chars).",
    };
  }

  const priority = args.priority || "MEDIUM";
  const deadline = args.deadline || null;

  try {
    const projectId = crypto.randomUUID();
    await tursoClient.execute({
      sql: `INSERT INTO "Project" (id, name, description, status, priority, "clientName", color, deadline, "createdAt", "updatedAt")
            VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        projectId,
        args.name.trim(),
        args.description?.trim() || null,
        priority,
        args.clientName?.trim() || null,
        args.color || null,
        deadline,
      ],
    });

    // Auto-add the creator as LEAD
    await tursoClient.execute({
      sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt")
            VALUES (?, ?, ?, 'LEAD', datetime('now'))`,
      args: [crypto.randomUUID(), projectId, userId],
    });

    return {
      toolCallId: "",
      toolName: "create_project",
      success: true,
      result: JSON.stringify({ projectId, name: args.name.trim(), priority, deadline, clientName: args.clientName?.trim() || null }),
      displayMessage: `Created project "${args.name.trim()}" with ${priority} priority.${deadline ? ` Deadline: ${deadline}.` : ""}`,
    };
  } catch (error) {
    console.error("[createProject tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "create_project",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to create project due to a database error.",
    };
  }
}

// ===== Tool: list_projects =====

async function listProjects(
  args: { status?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userId, userRole } = ctx;

  try {
    let rows;
    if (userRole === "SUPERADMIN") {
      if (args.status) {
        rows = (await tursoClient.execute({
          sql: `SELECT id, name, description, status, priority, deadline, "clientName", color
                FROM "Project"
                WHERE status = ? AND status != 'ARCHIVED'
                ORDER BY "createdAt" DESC`,
          args: [args.status],
        })).rows;
      } else {
        rows = (await tursoClient.execute({
          sql: `SELECT id, name, description, status, priority, deadline, "clientName", color
                FROM "Project"
                WHERE status != 'ARCHIVED'
                ORDER BY "createdAt" DESC`,
          args: [],
        })).rows;
      }
    } else {
      if (args.status) {
        rows = (await tursoClient.execute({
          sql: `SELECT p.id, p.name, p.description, p.status, p.priority, p.deadline, p."clientName", p.color
                FROM "Project" p
                JOIN "ProjectMember" pm ON p.id = pm."projectId"
                WHERE pm."userId" = ? AND pm."removedAt" IS NULL AND p.status = ? AND p.status != 'ARCHIVED'
                ORDER BY p."createdAt" DESC`,
          args: [userId, args.status],
        })).rows;
      } else {
        rows = (await tursoClient.execute({
          sql: `SELECT p.id, p.name, p.description, p.status, p.priority, p.deadline, p."clientName", p.color
                FROM "Project" p
                JOIN "ProjectMember" pm ON p.id = pm."projectId"
                WHERE pm."userId" = ? AND pm."removedAt" IS NULL AND p.status != 'ARCHIVED'
                ORDER BY p."createdAt" DESC`,
          args: [userId],
        })).rows;
      }
    }

    const projects = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || null,
      status: row.status,
      priority: row.priority,
      deadline: row.deadline || null,
      clientName: row.clientName || null,
      color: row.color || null,
    }));

    return {
      toolCallId: "",
      toolName: "list_projects",
      success: true,
      result: JSON.stringify({ count: projects.length, projects }),
      displayMessage: `Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`,
    };
  } catch (error) {
    console.error("[listProjects tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "list_projects",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to list projects.",
    };
  }
}

// ===== Tool: get_project_info =====

async function getProjectInfo(
  args: { projectId: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userId, userRole } = ctx;

  // Check access
  if (userRole !== "SUPERADMIN") {
    const access = await tursoClient.execute({
      sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
      args: [args.projectId, userId],
    });
    if (access.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "get_project_info",
        success: false,
        result: "You don't have access to this project.",
        displayMessage: "You don't have access to this project.",
      };
    }
  }

  try {
    const projectRows = await tursoClient.execute({
      sql: `SELECT id, name, description, status, priority, deadline, "clientName", color, "createdAt", "updatedAt"
            FROM "Project" WHERE id = ?`,
      args: [args.projectId],
    });

    if (projectRows.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "get_project_info",
        success: false,
        result: "Project not found.",
        displayMessage: "Project not found.",
      };
    }

    const row = projectRows.rows[0];

    // Get team count
    const teamResult = await tursoClient.execute({
      sql: `SELECT COUNT(*) as count FROM "ProjectMember" WHERE "projectId" = ? AND "removedAt" IS NULL`,
      args: [args.projectId],
    });
    const teamCount = Number(teamResult.rows[0].count);

    const project = {
      id: row.id,
      name: row.name,
      description: row.description || null,
      status: row.status,
      priority: row.priority,
      deadline: row.deadline || null,
      clientName: row.clientName || null,
      color: row.color || null,
      teamMembers: teamCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    return {
      toolCallId: "",
      toolName: "get_project_info",
      success: true,
      result: JSON.stringify(project),
      displayMessage: `Retrieved details for "${project.name}" (Status: ${project.status}, Team: ${teamCount}).`,
    };
  } catch (error) {
    console.error("[getProjectInfo tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "get_project_info",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to get project info.",
    };
  }
}

// ===== Tool: update_project =====

async function updateProject(
  args: {
    projectId: string;
    name?: string;
    description?: string;
    status?: string;
    priority?: string;
    deadline?: string;
    color?: string;
  },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  // RBAC: ADMIN+ or SUPERADMIN only
  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "",
      toolName: "update_project",
      success: false,
      result: "Permission denied: Only ADMIN and SUPERADMIN can update projects.",
      displayMessage: "Permission denied — only admins can update projects.",
    };
  }

  // Build dynamic UPDATE query
  const updates: string[] = [];
  const values: unknown[] = [];

  if (args.name !== undefined) {
    updates.push(`name = ?`);
    values.push(args.name.trim());
  }
  if (args.description !== undefined) {
    updates.push(`description = ?`);
    values.push(args.description?.trim() || null);
  }
  if (args.status !== undefined) {
    updates.push(`status = ?`);
    values.push(args.status);
  }
  if (args.priority !== undefined) {
    updates.push(`priority = ?`);
    values.push(args.priority);
  }
  if (args.deadline !== undefined) {
    updates.push(`deadline = ?`);
    values.push(args.deadline || null);
  }
  if (args.color !== undefined) {
    updates.push(`color = ?`);
    values.push(args.color || null);
  }

  if (updates.length === 0) {
    return {
      toolCallId: "",
      toolName: "update_project",
      success: false,
      result: "No fields to update.",
      displayMessage: "No update fields provided.",
    };
  }

  updates.push(`"updatedAt" = datetime('now')`);
  values.push(args.projectId);

  try {
    await tursoClient.execute({
      sql: `UPDATE "Project" SET ${updates.join(", ")} WHERE id = ?`,
      args: values,
    });

    // Get updated project name for display
    const nameResult = await tursoClient.execute({
      sql: `SELECT name FROM "Project" WHERE id = ?`,
      args: [args.projectId],
    });
    const projectName = nameResult.rows[0]?.name || "Project";

    return {
      toolCallId: "",
      toolName: "update_project",
      success: true,
      result: JSON.stringify({ projectId: args.projectId, updatedFields: args }),
      displayMessage: `Updated "${projectName}" successfully.`,
    };
  } catch (error) {
    console.error("[updateProject tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "update_project",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to update project.",
    };
  }
}

// ===== Tool: add_project_member =====

async function addProjectMember(
  args: { projectId: string; userId: string; role?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole, userId } = ctx;

  // RBAC: ADMIN, SUPERADMIN, or LEAD of this project
  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    // Check if user is LEAD of this project
    const leadCheck = await tursoClient.execute({
      sql: `SELECT role FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL AND role = 'LEAD'`,
      args: [args.projectId, userId],
    });
    if (leadCheck.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "add_project_member",
        success: false,
        result: "Permission denied: Only ADMIN, SUPERADMIN, or project LEAD can add members.",
        displayMessage: "Permission denied — only admins and project leads can add members.",
      };
    }
  }

  const memberRole = args.role || "MEMBER";

  try {
    // Check if user exists
    const userExists = await tursoClient.execute({
      sql: `SELECT id, name FROM "User" WHERE id = ?`,
      args: [args.userId],
    });
    if (userExists.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "add_project_member",
        success: false,
        result: "User not found.",
        displayMessage: "User not found in the system.",
      };
    }

    const memberName = userExists.rows[0].name as string;

    // Check if already a member
    const existing = await tursoClient.execute({
      sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
      args: [args.projectId, args.userId],
    });
    if (existing.rows.length > 0) {
      return {
        toolCallId: "",
        toolName: "add_project_member",
        success: false,
        result: "User is already a member of this project.",
        displayMessage: `${memberName} is already a member of this project.`,
      };
    }

    // Enforce single LEAD rule
    if (memberRole === "LEAD") {
      const existingLead = await tursoClient.execute({
        sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND role = 'LEAD' AND "removedAt" IS NULL`,
        args: [args.projectId],
      });
      if (existingLead.rows.length > 0) {
        return {
          toolCallId: "",
          toolName: "add_project_member",
          success: false,
          result: "This project already has a LEAD. Remove the existing LEAD first or assign a different role.",
          displayMessage: "This project already has a Lead. Only one Lead per project is allowed.",
        };
      }
    }

    await tursoClient.execute({
      sql: `INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt")
            VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [crypto.randomUUID(), args.projectId, args.userId, memberRole],
    });

    return {
      toolCallId: "",
      toolName: "add_project_member",
      success: true,
      result: JSON.stringify({ projectId: args.projectId, userId: args.userId, role: memberRole }),
      displayMessage: `Added ${memberName} to the project as ${memberRole}.`,
    };
  } catch (error) {
    console.error("[addProjectMember tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "add_project_member",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to add project member.",
    };
  }
}

// ===== Tool: knowledge_research (Knowledge-Based Research) =====

async function knowledgeResearch(
  args: { query: string; category?: string },
  _ctx: ExecutorContext
): Promise<AiToolResult> {
  if (!args.query || args.query.trim().length === 0) {
    return {
      toolCallId: "",
      toolName: "knowledge_research",
      success: false,
      result: "Research query is required.",
      displayMessage: "Missing research query.",
    };
  }

  const query = args.query.trim();
  const category = args.category || "general";

  // Knowledge-based research: return a structured prompt that guides the AI
  // to use its extensive training knowledge for the topic. This avoids fake HTTP
  // calls to non-existent endpoints while still providing valuable research context.
  const categoryGuidance: Record<string, string> = {
    competitors: `Provide a competitive analysis including: top 3-5 competitors/products in this space, their key features, pricing models, strengths/weaknesses, and what differentiates them. Include market positioning insights.`,
    technology: `Provide a technology analysis including: current best practices, recommended tech stack options, version considerations, framework comparisons, performance implications, and community/ecosystem support.`,
    ux_patterns: `Provide UX/design analysis including: current design trends, common UI patterns for this type of application, accessibility best practices (WCAG), responsive design considerations, and user experience benchmarks.`,
    security: `Provide security analysis including: common vulnerabilities for this type of application, authentication best practices, data protection requirements, OWASP top 10 relevance, compliance considerations (GDPR, SOC2), and security testing approaches.`,
    market_trends: `Provide market analysis including: current industry trends, growth projections, target market size, user adoption patterns, emerging technologies, and competitive landscape shifts.`,
    general: `Provide comprehensive research insights on this topic including: key facts, current best practices, relevant examples, and actionable recommendations.`,
  };

  const guidance = categoryGuidance[category] || categoryGuidance.general;

  const result = {
    query,
    category,
    researchGuidance: guidance,
    note: "Use your extensive training knowledge to provide detailed, specific, and current insights for this research topic. Include real product names, specific technologies, concrete examples, and actionable data points.",
  };

  return {
    toolCallId: "",
    toolName: "knowledge_research",
    success: true,
    result: JSON.stringify(result),
    displayMessage: `Researching: "${query.slice(0, 50)}" (${category})`,
  };
}

// ===== Tool: save_github_config =====

async function upsertSetting(tursoClient: ExecutorContext["tursoClient"], key: string, value: string): Promise<void> {
  const existing = await tursoClient.execute({
    sql: `SELECT key FROM "Settings" WHERE key = ?`,
    args: [key],
  });
  if (existing.rows.length > 0) {
    await tursoClient.execute({
      sql: `UPDATE "Settings" SET value = ?, "updatedAt" = datetime('now') WHERE key = ?`,
      args: [value, key],
    });
  } else {
    await tursoClient.execute({
      sql: `INSERT INTO "Settings" (key, value, "updatedAt") VALUES (?, ?, datetime('now'))`,
      args: [key, value],
    });
  }
}

async function saveGithubConfig(
  args: { repoUrl: string; pat: string; patExpiry?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  // RBAC: SUPERADMIN and ADMIN can save GitHub config
  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "",
      toolName: "save_github_config",
      success: false,
      result: "Permission denied: Only SUPERADMIN can save GitHub configuration.",
      displayMessage: "Permission denied — only Super Admin can save GitHub config.",
    };
  }

  if (!args.repoUrl || !args.pat) {
    return {
      toolCallId: "",
      toolName: "save_github_config",
      success: false,
      result: "Both repoUrl and pat are required.",
      displayMessage: "Missing GitHub URL or Personal Access Token.",
    };
  }

  try {
    const encryptedPat = encrypt(args.pat);

    // Upsert GITHUB_REPO_URL, GITHUB_PAT, GITHUB_PAT_EXPIRY
    await upsertSetting(tursoClient, "GITHUB_REPO_URL", args.repoUrl.trim());
    await upsertSetting(tursoClient, "GITHUB_PAT", encryptedPat);

    // Store expiry date (YYYY-MM-DD format, validated)
    if (args.patExpiry) {
      const expiryDate = new Date(args.patExpiry);
      if (isNaN(expiryDate.getTime())) {
        return {
          toolCallId: "",
          toolName: "save_github_config",
          success: false,
          result: "Invalid expiry date format. Use YYYY-MM-DD.",
          displayMessage: "The expiry date format is invalid. Please provide a date like 2025-12-31.",
        };
      }
      await upsertSetting(tursoClient, "GITHUB_PAT_EXPIRY", args.patExpiry);
    }

    const expiryNote = args.patExpiry ? ` Expiry reminder set for ${args.patExpiry}.` : "";
    return {
      toolCallId: "",
      toolName: "save_github_config",
      success: true,
      result: JSON.stringify({ repoUrl: args.repoUrl.trim(), patExpiry: args.patExpiry || null, saved: true }),
      displayMessage: `GitHub credentials saved securely. PAT encrypted and stored.${expiryNote}`,
    };
  } catch (error) {
    console.error("[saveGithubConfig tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "save_github_config",
      success: false,
      result: "Database error: " + (error instanceof Error ? error.message : "Unknown error"),
      displayMessage: "Failed to save GitHub configuration.",
    };
  }
}

// ===== Tool: save_database_config =====

async function saveDatabaseConfig(
  args: { dbUrl: string; dbAuthToken: string; dbType: string; dbTokenExpiry?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  // RBAC: SUPERADMIN and ADMIN can save database config
  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "",
      toolName: "save_database_config",
      success: false,
      result: "Permission denied: Only SUPERADMIN can save database configuration.",
      displayMessage: "Permission denied — only Super Admin can save database config.",
    };
  }

  if (!args.dbUrl || !args.dbAuthToken || !args.dbType) {
    return {
      toolCallId: "",
      toolName: "save_database_config",
      success: false,
      result: "dbUrl, dbAuthToken, and dbType are required.",
      displayMessage: "Missing database URL, auth token, or database type.",
    };
  }

  try {
    const encryptedToken = encrypt(args.dbAuthToken);

    // Upsert DB_URL, DB_AUTH_TOKEN, DB_TYPE, DB_TOKEN_EXPIRY
    await upsertSetting(tursoClient, "DB_URL", args.dbUrl.trim());
    await upsertSetting(tursoClient, "DB_AUTH_TOKEN", encryptedToken);
    await upsertSetting(tursoClient, "DB_TYPE", args.dbType.trim());

    // Store expiry date (YYYY-MM-DD format, validated)
    if (args.dbTokenExpiry) {
      const expiryDate = new Date(args.dbTokenExpiry);
      if (isNaN(expiryDate.getTime())) {
        return {
          toolCallId: "",
          toolName: "save_database_config",
          success: false,
          result: "Invalid expiry date format. Use YYYY-MM-DD.",
          displayMessage: "The expiry date format is invalid. Please provide a date like 2025-12-31.",
        };
      }
      await upsertSetting(tursoClient, "DB_TOKEN_EXPIRY", args.dbTokenExpiry);
    }

    const expiryNote = args.dbTokenExpiry ? ` Token expiry reminder set for ${args.dbTokenExpiry}.` : "";
    return {
      toolCallId: "",
      toolName: "save_database_config",
      success: true,
      result: JSON.stringify({ dbType: args.dbType.trim(), dbTokenExpiry: args.dbTokenExpiry || null, saved: true }),
      displayMessage: `Database configuration saved securely. Auth token encrypted and stored.${expiryNote}`,
    };
  } catch (error) {
    console.error("[saveDatabaseConfig tool] DB error:", error);
    return {
      toolCallId: "",
      toolName: "save_database_config",
      success: false,
      result: "Database error: " + (error instanceof Error ? error.message : "Unknown error"),
      displayMessage: "Failed to save database configuration.",
    };
  }
}

// ===== Tool: github_pull =====

async function githubPull(
  args: { path?: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  // RBAC: SUPERADMIN only
  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "",
      toolName: "github_pull",
      success: false,
      result: "Permission denied: Only SUPERADMIN can pull from GitHub.",
      displayMessage: "Permission denied — only Super Admin can use GitHub tools.",
    };
  }

  // Load GitHub config
  const repoResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
    args: [],
  });
  const patResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_PAT'`,
    args: [],
  });

  if (repoResult.rows.length === 0) {
    return {
      toolCallId: "",
      toolName: "github_pull",
      success: false,
      result: "GitHub not configured — run /init first.",
      displayMessage: "GitHub is not configured. Please run /init to set up GitHub credentials.",
    };
  }

  if (patResult.rows.length === 0) {
    return {
      toolCallId: "",
      toolName: "github_pull",
      success: false,
      result: "GitHub PAT not configured — run /init first.",
      displayMessage: "GitHub PAT is missing. Please run /init to set up GitHub credentials.",
    };
  }

  const repoUrl = repoResult.rows[0].value as string;
  let token: string;
  try {
    token = decrypt(patResult.rows[0].value as string);
  } catch {
    token = patResult.rows[0].value as string;
  }

  // Parse owner/repo from URL
  const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\s#?]+)/i);
  if (!match) {
    return {
      toolCallId: "",
      toolName: "github_pull",
      success: false,
      result: "Invalid GitHub repository URL: " + repoUrl,
      displayMessage: "The GitHub repository URL is invalid.",
    };
  }

  const owner = match[1];
  const repo = match[2];
  const branch = args.branch || "main";

  try {
    const headers: Record<string, string> = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "KarmaBoard/1.0",
    };

    if (args.path) {
      // Fetch specific file
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}?ref=${branch}`,
        { headers }
      );

      if (res.status === 404) {
        return {
          toolCallId: "",
          toolName: "github_pull",
          success: false,
          result: `File not found: ${args.path}`,
          displayMessage: `File '${args.path}' was not found in the repository.`,
        };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        if (res.status === 401 || res.status === 403) {
          return {
            toolCallId: "",
            toolName: "github_pull",
            success: false,
            result: "GitHub PAT expired or invalid. Please update it in /init.",
            displayMessage: "Your GitHub PAT appears to be expired or invalid. Please run /init to update it.",
          };
        }
        return {
          toolCallId: "",
          toolName: "github_pull",
          success: false,
          result: `GitHub API error (${res.status}): ${errText}`,
          displayMessage: `Failed to fetch from GitHub (${res.status}).`,
        };
      }

      const data = await res.json();
      // Decode base64 content
      let fileContent: string;
      if (data.encoding === "base64" && data.content) {
        fileContent = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
      } else {
        fileContent = data.content || "";
      }

      return {
        toolCallId: "",
        toolName: "github_pull",
        success: true,
        result: JSON.stringify({ path: data.path, sha: data.sha, size: data.size, content: fileContent }),
        displayMessage: `Fetched '${data.path}' (${data.size} bytes) from ${branch}.`,
      };
    } else {
      // List repo tree (top-level)
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`,
        { headers }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        if (res.status === 401 || res.status === 403) {
          return {
            toolCallId: "",
            toolName: "github_pull",
            success: false,
            result: "GitHub PAT expired or invalid. Please update it in /init.",
            displayMessage: "Your GitHub PAT appears to be expired or invalid. Please run /init to update it.",
          };
        }
        return {
          toolCallId: "",
          toolName: "github_pull",
          success: false,
          result: `GitHub API error (${res.status}): ${errText}`,
          displayMessage: `Failed to list repository tree (${res.status}).`,
        };
      }

      const tree = await res.json();
      const fileList = tree.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' or 'dir'
        size: item.size || 0,
      }));

      return {
        toolCallId: "",
        toolName: "github_pull",
        success: true,
        result: JSON.stringify({ branch, items: fileList }),
        displayMessage: `Listed ${fileList.length} items in repository root (${branch}).`,
      };
    }
  } catch (error) {
    console.error("[githubPull tool] Error:", error);
    return {
      toolCallId: "",
      toolName: "github_pull",
      success: false,
      result: `GitHub fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to fetch from GitHub.",
    };
  }
}

// ===== Tool: create_or_update_file =====

async function createOrUpdateFile(
  args: { path: string; content: string; message: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole, userId } = ctx;

  // RBAC: SUPERADMIN only
  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "",
      toolName: "create_or_update_file",
      success: false,
      result: "Permission denied: Only SUPERADMIN can create/update files.",
      displayMessage: "Permission denied — only Super Admin can create or update files.",
    };
  }

  if (!args.path || !args.content || !args.message) {
    return {
      toolCallId: "",
      toolName: "create_or_update_file",
      success: false,
      result: "path, content, and message are required.",
      displayMessage: "Missing required fields (path, content, message).",
    };
  }

  try {
    // Ensure AiProjectFile table exists (non-fatal)
    try {
      await tursoClient.execute({
        sql: `CREATE TABLE IF NOT EXISTS "AiProjectFile" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          "path" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "message" TEXT,
          "status" TEXT NOT NULL DEFAULT 'staged',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        args: [],
      });
      await tursoClient.execute({
        sql: `CREATE INDEX IF NOT EXISTS "AiProjectFile_projectId_idx" ON "AiProjectFile"("projectId")`,
        args: [],
      });
    } catch (tableErr) {
      console.error("[createOrUpdateFile] Table creation error (non-fatal):", tableErr);
    }

    // Find the user's active project (SUPERADMIN typically has access to all)
    // We need a projectId — find the most recent project the user is a member of
    const projectResult = await tursoClient.execute({
      sql: `SELECT pm."projectId" FROM "ProjectMember" pm WHERE pm."userId" = ? AND pm."removedAt" IS NULL ORDER BY pm."joinedAt" DESC LIMIT 1`,
      args: [userId],
    });

    if (projectResult.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "create_or_update_file",
        success: false,
        result: "No active project found. Please select a project first.",
        displayMessage: "No project found. Please make sure you have an active project.",
      };
    }

    const projectId = projectResult.rows[0].projectId as string;

    // Check if file already exists for this project+path
    const existing = await tursoClient.execute({
      sql: `SELECT id, status FROM "AiProjectFile" WHERE "projectId" = ? AND path = ?`,
      args: [projectId, args.path],
    });

    if (existing.rows.length > 0) {
      // Update existing file
      const existingId = existing.rows[0].id as string;
      await tursoClient.execute({
        sql: `UPDATE "AiProjectFile" SET content = ?, message = ?, status = 'modified', "updatedAt" = datetime('now') WHERE id = ?`,
        args: [args.content, args.message, existingId],
      });
      return {
        toolCallId: "",
        toolName: "create_or_update_file",
        success: true,
        result: JSON.stringify({ path: args.path, projectId, status: "modified" }),
        displayMessage: `Updated file '${args.path}' (staged for push).`,
      };
    } else {
      // Create new file
      const fileId = crypto.randomUUID();
      await tursoClient.execute({
        sql: `INSERT INTO "AiProjectFile" (id, "projectId", path, content, message, status, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, 'created', datetime('now'), datetime('now'))`,
        args: [fileId, projectId, args.path, args.content, args.message],
      });
      return {
        toolCallId: "",
        toolName: "create_or_update_file",
        success: true,
        result: JSON.stringify({ path: args.path, projectId, status: "created" }),
        displayMessage: `Created file '${args.path}' (staged for push).`,
      };
    }
  } catch (error) {
    console.error("[createOrUpdateFile tool] Error:", error);
    return {
      toolCallId: "",
      toolName: "create_or_update_file",
      success: false,
      result: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to create/update file.",
    };
  }
}

// ===== Tool: github_push_code =====

async function githubPushCode(
  args: { branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole, userId } = ctx;

  // RBAC: SUPERADMIN only
  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "",
      toolName: "github_push_code",
      success: false,
      result: "Permission denied: Only SUPERADMIN can push to GitHub.",
      displayMessage: "Permission denied — only Super Admin can push to GitHub.",
    };
  }

  // Load GitHub config
  const repoResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
    args: [],
  });
  const patResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_PAT'`,
    args: [],
  });

  if (repoResult.rows.length === 0 || patResult.rows.length === 0) {
    return {
      toolCallId: "",
      toolName: "github_push_code",
      success: false,
      result: "GitHub not configured — run /init first.",
      displayMessage: "GitHub is not configured. Please run /init first.",
    };
  }

  const repoUrl = repoResult.rows[0].value as string;
  let token: string;
  try {
    token = decrypt(patResult.rows[0].value as string);
  } catch {
    token = patResult.rows[0].value as string;
  }

  const branch = args.branch || "main";

  // Parse owner/repo from URL
  const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\s#?]+)/i);
  if (!match) {
    return {
      toolCallId: "",
      toolName: "github_push_code",
      success: false,
      result: "Invalid GitHub repository URL: " + repoUrl,
      displayMessage: "The GitHub repository URL is invalid.",
    };
  }

  const owner = match[1];
  const repo = match[2];

  try {
    // Find the user's active project
    const projectResult = await tursoClient.execute({
      sql: `SELECT pm."projectId" FROM "ProjectMember" pm WHERE pm."userId" = ? AND pm."removedAt" IS NULL ORDER BY pm."joinedAt" DESC LIMIT 1`,
      args: [userId],
    });

    if (projectResult.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: "No active project found.",
        displayMessage: "No project found. Please make sure you have an active project.",
      };
    }

    const projectId = projectResult.rows[0].projectId as string;

    // Load staged/modified files
    const filesResult = await tursoClient.execute({
      sql: `SELECT id, path, content, message FROM "AiProjectFile" WHERE "projectId" = ? AND status IN ('staged', 'created', 'modified')`,
      args: [projectId],
    });

    if (filesResult.rows.length === 0) {
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: "No staged files to push. Use create_or_update_file first.",
        displayMessage: "No staged files to push. Create or update files first using the create_or_update_file tool.",
      };
    }

    const files = filesResult.rows.map((row) => ({
      id: row.id as string,
      path: row.path as string,
      content: row.content as string,
      message: row.message as string,
    }));

    // Build commit message from first file's message
    const commitMsg = files[0].message || "chore: push files via Karma Space";

    const headers: Record<string, string> = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "KarmaBoard/1.0",
    };

    // 1. Get the current commit SHA for the branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      { headers }
    );
    if (!refRes.ok) {
      const errText = await refRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: `Failed to get branch ref (${refRes.status}): ${errText}`,
        displayMessage: `Failed to access branch '${branch}' on GitHub.`,
      };
    }
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 2. Create blobs for each file
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];

    for (const file of files) {
      const blobRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        }
      );
      if (!blobRes.ok) {
        const errText = await blobRes.text().catch(() => "Unknown error");
        return {
          toolCallId: "",
          toolName: "github_push_code",
          success: false,
          result: `Failed to create blob for ${file.path} (${blobRes.status}): ${errText}`,
          displayMessage: `Failed to push file '${file.path}' to GitHub.`,
        };
      }
      const blob = await blobRes.json();
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // 3. Create a tree with all blobs
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
      }
    );
    if (!treeRes.ok) {
      const errText = await treeRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: `Failed to create tree (${treeRes.status}): ${errText}`,
        displayMessage: "Failed to create git tree on GitHub.",
      };
    }
    const treeData = await treeRes.json();

    // 4. Create a commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [baseSha] }),
      }
    );
    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: `Failed to create commit (${commitRes.status}): ${errText}`,
        displayMessage: "Failed to create commit on GitHub.",
      };
    }
    const commitData = await commitRes.json();

    // 5. Update branch ref
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commitData.sha }),
      }
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "",
        toolName: "github_push_code",
        success: false,
        result: `Failed to update branch ref (${updateRes.status}): ${errText}`,
        displayMessage: `Failed to update branch '${branch}' on GitHub.`,
      };
    }

    // 6. Update all file statuses to 'pushed'
    for (const file of files) {
      await tursoClient.execute({
        sql: `UPDATE "AiProjectFile" SET status = 'pushed', "updatedAt" = datetime('now') WHERE id = ?`,
        args: [file.id],
      });
    }

    const pushedPaths = files.map((f) => f.path);
    return {
      toolCallId: "",
      toolName: "github_push_code",
      success: true,
      result: JSON.stringify({ commitSha: commitData.sha, branch, filesPushed: pushedPaths, count: files.length }),
      displayMessage: `Pushed ${files.length} file(s) to GitHub (${branch}). Commit: ${commitData.sha.slice(0, 7)}`,
    };
  } catch (error) {
    console.error("[githubPushCode tool] Error:", error);
    return {
      toolCallId: "",
      toolName: "github_push_code",
      success: false,
      result: `GitHub push error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to push to GitHub.",
    };
  }
}

// ===== Helper: Load GitHub Config =====

interface GithubConfig {
  owner: string;
  repo: string;
  token: string;
  headers: Record<string, string>;
}

async function loadGithubConfig(tursoClient: ExecutorContext["tursoClient"], branch?: string): Promise<GithubConfig | AiToolResult> {
  const repoResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_REPO_URL'`,
    args: [],
  });
  const patResult = await tursoClient.execute({
    sql: `SELECT value FROM "Settings" WHERE key = 'GITHUB_PAT'`,
    args: [],
  });

  if (repoResult.rows.length === 0) {
    return {
      toolCallId: "",
      toolName: "",
      success: false,
      result: "GitHub not configured — run /init first.",
      displayMessage: "GitHub is not configured. Please run /init to set up GitHub credentials.",
    };
  }

  if (patResult.rows.length === 0) {
    return {
      toolCallId: "",
      toolName: "",
      success: false,
      result: "GitHub PAT not configured — run /init first.",
      displayMessage: "GitHub PAT is missing. Please run /init to set up GitHub credentials.",
    };
  }

  const repoUrl = repoResult.rows[0].value as string;
  let token: string;
  try {
    token = decrypt(patResult.rows[0].value as string);
  } catch {
    token = patResult.rows[0].value as string;
  }

  const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\s#?]+)/i);
  if (!match) {
    return {
      toolCallId: "",
      toolName: "",
      success: false,
      result: "Invalid GitHub repository URL: " + repoUrl,
      displayMessage: "The GitHub repository URL is invalid.",
    };
  }

  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "KarmaBoard/1.0",
  };

  return { owner: match[1], repo: match[2], token, headers };
}

// ===== Tool: fs_list_dir =====

async function fsListDir(
  args: { path?: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "", toolName: "fs_list_dir",
      success: false, result: "Permission denied: Only ADMIN and SUPERADMIN can list directories.",
      displayMessage: "Permission denied — only admins can list directories.",
    };
  }

  const branch = args.branch || "main";
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    let items: { name: string; path: string; type: string; size: number }[] = [];

    if (args.path) {
      // Use contents API for a specific path
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}?ref=${branch}`,
        { headers }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        return {
          toolCallId: "", toolName: "fs_list_dir",
          success: false, result: `GitHub API error (${res.status}): ${errText}`,
          displayMessage: `Failed to list directory '${args.path}' (${res.status}).`,
        };
      }

      const data = await res.json();
      items = Array.isArray(data)
        ? data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, size: item.size || 0 }))
        : [{ name: data.name, path: data.path, type: data.type, size: data.size || 0 }];
    } else {
      // Use recursive tree API for full listing
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        return {
          toolCallId: "", toolName: "fs_list_dir",
          success: false, result: `GitHub API error (${res.status}): ${errText}`,
          displayMessage: `Failed to list repository tree (${res.status}).`,
        };
      }

      const data = await res.json();
      items = (data.tree || []).map((item: any) => ({
        name: item.path.split("/").pop() || item.path,
        path: item.path,
        type: item.type === "tree" ? "dir" : "file",
        size: item.size || 0,
      }));
    }

    return {
      toolCallId: "", toolName: "fs_list_dir",
      success: true,
      result: JSON.stringify({ branch, path: args.path || "/", count: items.length, items }),
      displayMessage: `Listed ${items.length} item(s) in '${args.path || "/"}' (${branch}).`,
    };
  } catch (error) {
    console.error("[fsListDir tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_list_dir",
      success: false, result: `Error listing directory: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to list directory.",
    };
  }
}

// ===== Tool: fs_read_file =====

async function fsReadFile(
  args: { path: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN" && userRole !== "ADMIN") {
    return {
      toolCallId: "", toolName: "fs_read_file",
      success: false, result: "Permission denied: Only ADMIN and SUPERADMIN can read files.",
      displayMessage: "Permission denied — only admins can read files.",
    };
  }

  if (!args.path) {
    return {
      toolCallId: "", toolName: "fs_read_file",
      success: false, result: "File path is required.",
      displayMessage: "Missing file path.",
    };
  }

  const branch = args.branch || "main";
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}?ref=${branch}`,
      { headers }
    );

    if (res.status === 404) {
      return {
        toolCallId: "", toolName: "fs_read_file",
        success: false, result: `File not found: ${args.path}`,
        displayMessage: `File '${args.path}' was not found in the repository.`,
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_read_file",
        success: false, result: `GitHub API error (${res.status}): ${errText}`,
        displayMessage: `Failed to read file '${args.path}' (${res.status}).`,
      };
    }

    const data = await res.json();
    let fileContent: string;
    if (data.encoding === "base64" && data.content) {
      fileContent = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    } else {
      fileContent = data.content || "";
    }

    return {
      toolCallId: "", toolName: "fs_read_file",
      success: true,
      result: JSON.stringify({ path: data.path, sha: data.sha, size: data.size, encoding: data.encoding, content: fileContent }),
      displayMessage: `Read '${data.path}' (${data.size} bytes) from ${branch}.`,
    };
  } catch (error) {
    console.error("[fsReadFile tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_read_file",
      success: false, result: `Error reading file: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to read file.",
    };
  }
}

// ===== Tool: fs_write_file =====

async function fsWriteFile(
  args: { path: string; content: string; message: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "", toolName: "fs_write_file",
      success: false, result: "Permission denied: Only SUPERADMIN can write files.",
      displayMessage: "Permission denied — only Super Admin can write files.",
    };
  }

  if (!args.path || !args.content || !args.message) {
    return {
      toolCallId: "", toolName: "fs_write_file",
      success: false, result: "path, content, and message are required.",
      displayMessage: "Missing required fields (path, content, message).",
    };
  }

  const branch = args.branch || "main";
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    // Check if file exists to get SHA
    const existingRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}?ref=${branch}`,
      { headers }
    );

    const body: Record<string, unknown> = {
      message: args.message,
      content: Buffer.from(args.content).toString("base64"),
      branch,
    };

    if (existingRes.ok) {
      const existingData = await existingRes.json();
      body.sha = existingData.sha;
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_write_file",
        success: false, result: `GitHub API error (${res.status}): ${errText}`,
        displayMessage: `Failed to write file '${args.path}' (${res.status}).`,
      };
    }

    const data = await res.json();
    const action = body.sha ? "updated" : "created";

    return {
      toolCallId: "", toolName: "fs_write_file",
      success: true,
      result: JSON.stringify({ path: args.path, action, commitSha: data.commit?.sha, url: data.content?.html_url }),
      displayMessage: `${action === "created" ? "Created" : "Updated"} '${args.path}' on ${branch}. Commit: ${data.commit?.sha?.slice(0, 7)}`,
    };
  } catch (error) {
    console.error("[fsWriteFile tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_write_file",
      success: false, result: `Error writing file: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to write file.",
    };
  }
}

// ===== Tool: fs_delete_file =====

async function fsDeleteFile(
  args: { path: string; message: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "", toolName: "fs_delete_file",
      success: false, result: "Permission denied: Only SUPERADMIN can delete files.",
      displayMessage: "Permission denied — only Super Admin can delete files.",
    };
  }

  if (!args.path || !args.message) {
    return {
      toolCallId: "", toolName: "fs_delete_file",
      success: false, result: "path and message are required.",
      displayMessage: "Missing required fields (path, message).",
    };
  }

  const branch = args.branch || "main";
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    // Get the file SHA first
    const existingRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}?ref=${branch}`,
      { headers }
    );

    if (!existingRes.ok) {
      const errText = await existingRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_delete_file",
        success: false, result: `File not found or cannot be accessed (${existingRes.status}): ${errText}`,
        displayMessage: `File '${args.path}' was not found or cannot be deleted.`,
      };
    }

    const existingData = await existingRes.json();
    const sha = existingData.sha;

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}`,
      {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: args.message, sha, branch }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_delete_file",
        success: false, result: `GitHub API error (${res.status}): ${errText}`,
        displayMessage: `Failed to delete file '${args.path}' (${res.status}).`,
      };
    }

    const data = await res.json();

    return {
      toolCallId: "", toolName: "fs_delete_file",
      success: true,
      result: JSON.stringify({ path: args.path, deleted: true, commitSha: data.commit?.sha, url: data.content?.html_url }),
      displayMessage: `Deleted '${args.path}' from ${branch}. Commit: ${data.commit?.sha?.slice(0, 7)}`,
    };
  } catch (error) {
    console.error("[fsDeleteFile tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_delete_file",
      success: false, result: `Error deleting file: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to delete file.",
    };
  }
}

// ===== Tool: fs_search_code =====

async function fsSearchCode(
  args: { query: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "", toolName: "fs_search_code",
      success: false, result: "Permission denied: Only SUPERADMIN can search code.",
      displayMessage: "Permission denied — only Super Admin can search code.",
    };
  }

  if (!args.query) {
    return {
      toolCallId: "", toolName: "fs_search_code",
      success: false, result: "Search query is required.",
      displayMessage: "Missing search query.",
    };
  }

  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    const q = encodeURIComponent(`${args.query} repo:${owner}/${repo}`);
    const res = await fetch(
      `https://api.github.com/search/code?q=${q}`,
      { headers }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_search_code",
        success: false, result: `GitHub Search API error (${res.status}): ${errText}`,
        displayMessage: `Code search failed (${res.status}).`,
      };
    }

    const data = await res.json();
    const results = (data.items || []).map((item: any) => ({
      name: item.name,
      path: item.path,
      score: item.score,
      htmlUrl: item.html_url,
    }));

    return {
      toolCallId: "", toolName: "fs_search_code",
      success: true,
      result: JSON.stringify({ query: args.query, total: data.total_count, results }),
      displayMessage: `Found ${data.total_count} result(s) for "${args.query}".`,
    };
  } catch (error) {
    console.error("[fsSearchCode tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_search_code",
      success: false, result: `Error searching code: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Code search failed.",
    };
  }
}

// ===== Tool: fs_batch_write =====

async function fsBatchWrite(
  args: { files: { path: string; content: string; message?: string }[]; branch?: string; message?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "", toolName: "fs_batch_write",
      success: false, result: "Permission denied: Only SUPERADMIN can batch write files.",
      displayMessage: "Permission denied — only Super Admin can batch write.",
    };
  }

  if (!args.files || args.files.length === 0) {
    return {
      toolCallId: "", toolName: "fs_batch_write",
      success: false, result: "files array is required and must not be empty.",
      displayMessage: "No files provided for batch write.",
    };
  }

  const branch = args.branch || "main";
  const commitMsg = args.message || "chore: batch write via Karma Space";
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    // 1. Get current commit SHA for the branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      { headers }
    );
    if (!refRes.ok) {
      const errText = await refRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_batch_write",
        success: false, result: `Failed to get branch ref (${refRes.status}): ${errText}`,
        displayMessage: `Failed to access branch '${branch}' on GitHub.`,
      };
    }
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 2. Create blobs for each file
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];

    for (const file of args.files) {
      const blobRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        }
      );
      if (!blobRes.ok) {
        const errText = await blobRes.text().catch(() => "Unknown error");
        return {
          toolCallId: "", toolName: "fs_batch_write",
          success: false, result: `Failed to create blob for ${file.path} (${blobRes.status}): ${errText}`,
          displayMessage: `Failed to process file '${file.path}' (${blobRes.status}).`,
        };
      }
      const blob = await blobRes.json();
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // 3. Create a tree with all blobs
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
      }
    );
    if (!treeRes.ok) {
      const errText = await treeRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_batch_write",
        success: false, result: `Failed to create tree (${treeRes.status}): ${errText}`,
        displayMessage: "Failed to create git tree on GitHub.",
      };
    }
    const treeData = await treeRes.json();

    // 4. Create a commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [baseSha] }),
      }
    );
    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_batch_write",
        success: false, result: `Failed to create commit (${commitRes.status}): ${errText}`,
        displayMessage: "Failed to create commit on GitHub.",
      };
    }
    const commitData = await commitRes.json();

    // 5. Update branch ref
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commitData.sha }),
      }
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "fs_batch_write",
        success: false, result: `Failed to update branch ref (${updateRes.status}): ${errText}`,
        displayMessage: `Failed to update branch '${branch}' on GitHub.`,
      };
    }

    const pushedPaths = args.files.map((f) => f.path);
    return {
      toolCallId: "", toolName: "fs_batch_write",
      success: true,
      result: JSON.stringify({ commitSha: commitData.sha, branch, filesWritten: pushedPaths, count: args.files.length }),
      displayMessage: `Batch wrote ${args.files.length} file(s) to GitHub (${branch}). Commit: ${commitData.sha.slice(0, 7)}`,
    };
  } catch (error) {
    console.error("[fsBatchWrite tool] Error:", error);
    return {
      toolCallId: "", toolName: "fs_batch_write",
      success: false, result: `Batch write error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to batch write files to GitHub.",
    };
  }
}

// ===== Helper: Extract text from ZIP buffer =====

async function extractTextFromZipBuffer(buffer: ArrayBuffer): Promise<string | null> {
  // Simple ZIP parser: find Local File Header entries and extract uncompressed content
  // ZIP format: PK\x03\x04 followed by file metadata and content
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  let offset = 0;

  while (offset < bytes.length - 30) {
    // Look for Local File Header signature: PK\x03\x04
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4B &&
        bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
      const compressionMethod = bytes[offset + 8] | (bytes[offset + 9] << 8);
      const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) |
        (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
      const uncompressedSize = bytes[offset + 22] | (bytes[offset + 23] << 8) |
        (bytes[offset + 24] << 16) | (bytes[offset + 25] << 24);
      const fileNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const extraFieldLength = bytes[offset + 28] | (bytes[offset + 29] << 8);

      const fileNameStart = offset + 30;
      const fileName = new TextDecoder().decode(bytes.slice(fileNameStart, fileNameStart + fileNameLength));
      const dataStart = fileNameStart + fileNameLength + extraFieldLength;

      if (compressionMethod === 0) {
        // STORED (no compression)
        const content = new TextDecoder().decode(bytes.slice(dataStart, dataStart + uncompressedSize));
        if (fileName.endsWith(".txt")) {
          parts.push(content);
        }
        offset = dataStart + compressedSize;
      } else if (compressionMethod === 8) {
        // DEFLATE - use DecompressionStream if available (Edge Runtime)
        if (typeof DecompressionStream !== "undefined") {
          try {
            const deflateStream = new DecompressionStream("deflate-raw");
            const writer = deflateStream.writable.getWriter();
            writer.write(bytes.slice(dataStart, dataStart + compressedSize));
            writer.close();

            const reader = deflateStream.readable.getReader();
            const chunks: Uint8Array[] = [];
            let totalSize = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              totalSize += value.length;
            }

            const result = new Uint8Array(totalSize);
            let pos = 0;
            for (const chunk of chunks) {
              result.set(chunk, pos);
              pos += chunk.length;
            }

            const content = new TextDecoder().decode(result);
            if (fileName.endsWith(".txt")) {
              parts.push(content);
            }
          } catch {
            // Decompression failed, skip
          }
        }
        offset = dataStart + compressedSize;
      } else {
        offset = dataStart + compressedSize;
      }
    } else {
      offset++;
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

// ===== Tool: exec_command =====

async function execCommand(
  args: { command: string; timeout?: number; working_directory?: string; branch?: string },
  ctx: ExecutorContext
): Promise<AiToolResult> {
  const { tursoClient, userRole } = ctx;

  if (userRole !== "SUPERADMIN") {
    return {
      toolCallId: "", toolName: "exec_command",
      success: false, result: "Permission denied: Only SUPERADMIN can execute commands.",
      displayMessage: "Permission denied — only Super Admin can execute commands.",
    };
  }

  if (!args.command) {
    return {
      toolCallId: "", toolName: "exec_command",
      success: false, result: "Command is required.",
      displayMessage: "Missing command to execute.",
    };
  }

  const branch = args.branch || "main";
  const timeoutSec = Math.min(args.timeout || 120, 600);
  const config = await loadGithubConfig(tursoClient);
  if (!("owner" in config)) return config as AiToolResult;

  const { owner, repo, headers } = config;

  try {
    // 1. Find the karma-exec workflow
    const wfRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows`,
      { headers }
    );

    if (!wfRes.ok) {
      const errText = await wfRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "exec_command",
        success: false, result: `Failed to list workflows (${wfRes.status}): ${errText}`,
        displayMessage: `Failed to find execution workflow (${wfRes.status}).`,
      };
    }

    const wfData = await wfRes.json();
    const workflow = (wfData.workflows || []).find((w: any) =>
      w.path?.endsWith("karma-exec.yml") || w.path?.endsWith("karma-exec.yaml") || w.name === "karma-exec"
    );

    if (!workflow) {
      return {
        toolCallId: "", toolName: "exec_command",
        success: false,
        result: "No karma-exec workflow found. Ensure 'karma-exec.yml' exists in .github/workflows/.",
        displayMessage: "No execution workflow found. Please create a 'karma-exec.yml' workflow in .github/workflows/.",
      };
    }

    // 2. Trigger the workflow
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow.id}/dispatches`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: branch,
          inputs: {
            command: args.command,
            timeout: String(timeoutSec),
            working_directory: args.working_directory || "/",
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const errText = await dispatchRes.text().catch(() => "Unknown error");
      return {
        toolCallId: "", toolName: "exec_command",
        success: false, result: `Failed to trigger workflow (${dispatchRes.status}): ${errText}`,
        displayMessage: `Failed to execute command (${dispatchRes.status}).`,
      };
    }

    // 3. Poll for the run (wait a few seconds first for GitHub to register the run)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let runId: number | null = null;
    let runUrl: string | null = null;
    let runStatus: string = "queued";
    let runConclusion: string | null = null;
    const pollStart = Date.now();

    while (Date.now() - pollStart < timeoutSec * 1000) {
      const runsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`,
        { headers }
      );

      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const matchingRun = (runsData.workflow_runs || []).find((r: any) =>
          r.workflow_id === workflow.id && r.ref === branch &&
          (r.status === "queued" || r.status === "in_progress" || r.status === "completed")
        );

        if (matchingRun) {
          runId = matchingRun.id;
          runUrl = matchingRun.html_url;
          runStatus = matchingRun.status;
          runConclusion = matchingRun.conclusion;

          if (runStatus === "completed") break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // 4. Get job details and logs if run completed
    let stepResults: { name: string; conclusion: string }[] = [];
    let commandOutput: string | null = null;

    if (runId) {
      try {
        const jobsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
          { headers }
        );
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          for (const job of jobsData.jobs || []) {
            for (const step of job.steps || []) {
              stepResults.push({ name: step.name, conclusion: step.conclusion || "unknown" });
            }
          }
        }
      } catch (e) {
        console.error("[execCommand] Error fetching job details:", e);
      }

      // 5. Try to download the artifact with command output
      if (runStatus === "completed") {
        try {
          const artifactsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
            { headers }
          );
          if (artifactsRes.ok) {
            const artifactsData = await artifactsRes.json();
            const outputArtifact = (artifactsData.artifacts || []).find(
              (a: any) => a.name?.startsWith("karma-output-")
            );
            if (outputArtifact) {
              // Download the artifact zip (contains karma-output.txt and karma-error.txt)
              const zipRes = await fetch(outputArtifact.archive_download_url, {
                headers: { ...headers, Accept: "application/zip" },
              });
              if (zipRes.ok) {
                // Parse the zip to extract text files
                const zipBuffer = await zipRes.arrayBuffer();
                commandOutput = await extractTextFromZipBuffer(zipBuffer);
              }
            }
          }
        } catch (e) {
          console.error("[execCommand] Error fetching artifact:", e);
        }
      }
    }

    // 6. Try to get logs directly as fallback (for simpler output)
    if (!commandOutput && runId && runStatus === "completed") {
      try {
        const logsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
          { headers }
        );
        if (logsRes.ok) {
          const logText = await logsRes.text();
          // Extract the "Execute command" section
          const execMatch = logText.match(/Execute command[\s\S]*?(?=\n\x00|\n\n[A-Z]|\Z)/);
          if (execMatch) {
            const cleaned = execMatch[0]
              .replace(/\x00/g, "")
              .replace(/\x1b\[[0-9;]*m/g, "")
              .trim();
            if (cleaned.length > 50) {
              commandOutput = cleaned.slice(0, 10000);
            }
          }
        }
      } catch {
        // Logs not available, that's fine
      }
    }

    return {
      toolCallId: "", toolName: "exec_command",
      success: runStatus === "completed" && runConclusion === "success",
      result: JSON.stringify({
        command: args.command,
        workflowId: workflow.id,
        runId,
        runUrl,
        status: runStatus,
        conclusion: runConclusion,
        steps: stepResults,
        output: commandOutput || null,
      }),
      displayMessage: runStatus === "completed"
        ? `Command completed (${runConclusion}). ${runUrl ? `View: ${runUrl}` : ""}${commandOutput ? `\n\nOutput:\n${commandOutput.slice(0, 2000)}` : ""}`
        : `Command ${runStatus}... ${runUrl ? `Monitor: ${runUrl}` : ""}`,
    };
  } catch (error) {
    console.error("[execCommand tool] Error:", error);
    return {
      toolCallId: "", toolName: "exec_command",
      success: false, result: `Execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to execute command.",
    };
  }
}

// ===== Tool: web_search =====

async function webSearch(
  args: { query: string; num?: number },
  _ctx: ExecutorContext
): Promise<AiToolResult> {
  if (!args.query || args.query.trim().length === 0) {
    return {
      toolCallId: "", toolName: "web_search",
      success: false, result: "Search query is required.",
      displayMessage: "Missing search query.",
    };
  }

  try {
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAIClass = ZAIModule.default as any;
    const zai = await ZAIClass.create();
    const response: any = await zai.functions.invoke("web_search", {
      query: args.query.trim(),
      num: args.num || 5,
    });

    const results = response?.results || response?.data || response?.items || response || [];

    return {
      toolCallId: "", toolName: "web_search",
      success: true,
      result: JSON.stringify({ query: args.query, count: Array.isArray(results) ? results.length : 0, results }),
      displayMessage: `Found ${Array.isArray(results) ? results.length : 0} web result(s) for "${args.query.slice(0, 50)}".`,
    };
  } catch (error) {
    console.error("[webSearch tool] Error:", error);
    return {
      toolCallId: "", toolName: "web_search",
      success: false, result: `Web search error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Web search failed. The search service may be unavailable.",
    };
  }
}

// ===== Tool: web_read_page =====

async function webReadPage(
  args: { url: string },
  _ctx: ExecutorContext
): Promise<AiToolResult> {
  if (!args.url) {
    return {
      toolCallId: "", toolName: "web_read_page",
      success: false, result: "URL is required.",
      displayMessage: "Missing URL to read.",
    };
  }

  try {
    // First try z-ai-web-dev-sdk
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAIClass = ZAIModule.default as any;
    const zai = await ZAIClass.create();
    if (zai?.functions) {
      const response: any = await zai.functions.invoke("web_reader" as any, { url: args.url });
      if (response) {
        const content = response.content || response.text || response.data || JSON.stringify(response);
        return {
          toolCallId: "", toolName: "web_read_page",
          success: true,
          result: JSON.stringify({ url: args.url, title: response.title || null, content }),
          displayMessage: `Read page: ${args.url}`,
        };
      }
    }
  } catch {
    // SDK not available or web_reader not supported, fall back to fetch
  }

  // Fallback: simple fetch + text extraction
  try {
    const res = await fetch(args.url, {
      headers: {
        "User-Agent": "KarmaBoard/1.0 (compatible; bot)",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
      },
    });

    if (!res.ok) {
      return {
        toolCallId: "", toolName: "web_read_page",
        success: false, result: `Failed to fetch page (${res.status}).`,
        displayMessage: `Could not read page (${res.status}).`,
      };
    }

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (contentType.includes("application/json")) {
      return {
        toolCallId: "", toolName: "web_read_page",
        success: true,
        result: JSON.stringify({ url: args.url, content: rawText }),
        displayMessage: `Read JSON from ${args.url}`,
      };
    }

    // Strip HTML tags and extract text content
    const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Remove script/style tags and their content
    const stripped = rawText
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to reasonable length for AI context
    const maxLen = 10000;
    const content = stripped.length > maxLen ? stripped.slice(0, maxLen) + "... (truncated)" : stripped;

    return {
      toolCallId: "", toolName: "web_read_page",
      success: true,
      result: JSON.stringify({ url: args.url, title, content }),
      displayMessage: `Read page: ${title || args.url} (${content.length} chars)`,
    };
  } catch (error) {
    console.error("[webReadPage tool] Error:", error);
    return {
      toolCallId: "", toolName: "web_read_page",
      success: false, result: `Failed to read page: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to read web page.",
    };
  }
}

// ===== Tool: image_generate =====

async function imageGenerate(
  args: { prompt: string; size?: string },
  _ctx: ExecutorContext
): Promise<AiToolResult> {
  if (!args.prompt || args.prompt.trim().length === 0) {
    return {
      toolCallId: "", toolName: "image_generate",
      success: false, result: "Prompt is required.",
      displayMessage: "Missing image generation prompt.",
    };
  }

  try {
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAIClass = ZAIModule.default as any;
    const zai = await ZAIClass.create();
    const response: any = await zai.images.generations.create({
      prompt: args.prompt.trim(),
      size: args.size || "1024x1024",
    });

    const images = response?.data || response?.images || [];
    const base64Data = images.length > 0
      ? (images[0].b64_json || images[0].url || images[0].data || null)
      : null;

    return {
      toolCallId: "", toolName: "image_generate",
      success: !!base64Data,
      result: JSON.stringify({
        prompt: args.prompt,
        size: args.size || "1024x1024",
        imageCount: images.length,
        imageData: base64Data ? `[base64 image data, ${typeof base64Data === "string" ? base64Data.length : 0} chars]` : null,
      }),
      displayMessage: base64Data ? `Generated image from prompt: "${args.prompt.slice(0, 50)}"` : "Image generation returned no data.",
    };
  } catch (error) {
    console.error("[imageGenerate tool] Error:", error);
    return {
      toolCallId: "", toolName: "image_generate",
      success: false, result: `Image generation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      displayMessage: "Failed to generate image. The service may be unavailable.",
    };
  }
}

// ===== Main Executor =====

/**
 * Execute a single AI tool call with proper RBAC checks.
 */
export async function executeToolCall(
  toolCall: AiToolCall,
  ctx: ExecutorContext
): Promise<AiToolResult> {
  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      success: false,
      result: `Invalid tool arguments: could not parse JSON.`,
      displayMessage: "Invalid tool arguments.",
    };
  }

  const toolName = toolCall.function.name;

  // Check if tool is allowed for this role
  const allowed = isToolAllowedForRole(toolName, ctx.userRole);
  if (!allowed) {
    return {
      toolCallId: toolCall.id,
      toolName,
      success: false,
      result: `Permission denied: Your role (${ctx.userRole}) cannot use the "${toolName}" tool.`,
      displayMessage: `You don't have permission to use "${toolName}". Contact your admin.`,
    };
  }

  switch (toolName) {
    case "create_project":
      return { ...(await createProject(parsedArgs as Parameters<typeof createProject>[0], ctx)), toolCallId: toolCall.id };
    case "list_projects":
      return { ...(await listProjects(parsedArgs as Parameters<typeof listProjects>[0], ctx)), toolCallId: toolCall.id };
    case "get_project_info":
      return { ...(await getProjectInfo(parsedArgs as Parameters<typeof getProjectInfo>[0], ctx)), toolCallId: toolCall.id };
    case "update_project":
      return { ...(await updateProject(parsedArgs as Parameters<typeof updateProject>[0], ctx)), toolCallId: toolCall.id };
    case "add_project_member":
      return { ...(await addProjectMember(parsedArgs as Parameters<typeof addProjectMember>[0], ctx)), toolCallId: toolCall.id };
    case "knowledge_research":
      return { ...(await knowledgeResearch(parsedArgs as { query: string }, ctx)), toolCallId: toolCall.id };
    case "save_github_config":
      return { ...(await saveGithubConfig(parsedArgs as { repoUrl: string; pat: string; patExpiry?: string }, ctx)), toolCallId: toolCall.id };
    case "save_database_config":
      return { ...(await saveDatabaseConfig(parsedArgs as { dbUrl: string; dbAuthToken: string; dbType: string; dbTokenExpiry?: string }, ctx)), toolCallId: toolCall.id };
    case "github_pull":
      return { ...(await githubPull(parsedArgs as { path?: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "create_or_update_file":
      return { ...(await createOrUpdateFile(parsedArgs as { path: string; content: string; message: string }, ctx)), toolCallId: toolCall.id };
    case "github_push_code":
      return { ...(await githubPushCode(parsedArgs as { branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_list_dir":
      return { ...(await fsListDir(parsedArgs as { path?: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_read_file":
      return { ...(await fsReadFile(parsedArgs as { path: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_write_file":
      return { ...(await fsWriteFile(parsedArgs as { path: string; content: string; message: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_delete_file":
      return { ...(await fsDeleteFile(parsedArgs as { path: string; message: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_search_code":
      return { ...(await fsSearchCode(parsedArgs as { query: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "fs_batch_write":
      return { ...(await fsBatchWrite(parsedArgs as { files: { path: string; content: string; message?: string }[]; branch?: string; message?: string }, ctx)), toolCallId: toolCall.id };
    case "exec_command":
      return { ...(await execCommand(parsedArgs as { command: string; timeout?: number; working_directory?: string; branch?: string }, ctx)), toolCallId: toolCall.id };
    case "web_search":
      return { ...(await webSearch(parsedArgs as { query: string; num?: number }, ctx)), toolCallId: toolCall.id };
    case "web_read_page":
      return { ...(await webReadPage(parsedArgs as { url: string }, ctx)), toolCallId: toolCall.id };
    case "image_generate":
      return { ...(await imageGenerate(parsedArgs as { prompt: string; size?: string }, ctx)), toolCallId: toolCall.id };
    default:
      return {
        toolCallId: toolCall.id,
        toolName,
        success: false,
        result: `Unknown tool: ${toolName}`,
        displayMessage: `Unknown tool "${toolName}".`,
      };
  }
}

function isToolAllowedForRole(toolName: string, role: string): boolean {
  // SUPERADMIN-only tools (not even ADMIN)
  const superAdminOnlyTools = [
    "fs_write_file", "fs_delete_file",
    "fs_search_code", "fs_batch_write", "exec_command", "image_generate",
  ];
  // SUPERADMIN+ADMIN tools (read-only filesystem)
  const adminPlusFsTools = ["fs_list_dir", "fs_read_file"];
  // ADMIN+ tools (restricted from MEMBER role)
  const adminPlusTools = ["create_project", "update_project", "add_project_member", "github_pull", "create_or_update_file", "github_push_code"];
  // SUPERADMIN or ADMIN-only tools (web_read_page)
  const superOrAdminTools = ["web_read_page"];

  if (role === "SUPERADMIN") return true;
  if (role === "ADMIN") {
    // ADMIN can use adminPlusFsTools + adminPlusTools + superOrAdminTools + public tools
    return !superAdminOnlyTools.includes(toolName);
  }
  // MEMBER or other roles
  if (superAdminOnlyTools.includes(toolName) || adminPlusTools.includes(toolName) || superOrAdminTools.includes(toolName) || adminPlusFsTools.includes(toolName)) {
    return false;
  }
  return true; // web_search and knowledge_research are available to all roles
}

/**
 * Get a human-readable label for a tool name.
 */
export function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    create_project: "Creating project",
    list_projects: "Listing projects",
    get_project_info: "Getting project info",
    update_project: "Updating project",
    add_project_member: "Adding team member",
    knowledge_research: "Researching topic",
    save_github_config: "Saving GitHub config",
    save_database_config: "Saving database config",
    github_pull: "Pulling from GitHub",
    create_or_update_file: "Creating file",
    github_push_code: "Pushing to GitHub",
    fs_list_dir: "Directory Listing",
    fs_read_file: "Read File",
    fs_write_file: "Write File",
    fs_delete_file: "Delete File",
    fs_search_code: "Code Search",
    fs_batch_write: "Batch Write",
    exec_command: "Execute Command",
    web_search: "Web Search",
    web_read_page: "Read Web Page",
    image_generate: "Generate Image",
  };
  return labels[toolName] || toolName;
}

/**
 * Get an icon for a tool name.
 */
export function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    create_project: "🏗️",
    list_projects: "📋",
    get_project_info: "🔍",
    update_project: "✏️",
    add_project_member: "👤",
    knowledge_research: "📚",
    save_github_config: "🔗",
    save_database_config: "🗄️",
    github_pull: "📥",
    create_or_update_file: "📝",
    github_push_code: "🚀",
    fs_list_dir: "📁",
    fs_read_file: "📁",
    fs_write_file: "✏️",
    fs_delete_file: "🗑️",
    fs_search_code: "🔍",
    fs_batch_write: "📦",
    exec_command: "⌨️",
    web_search: "🌐",
    web_read_page: "📖",
    image_generate: "🎨",
  };
  return icons[toolName] || "🔧";
}
