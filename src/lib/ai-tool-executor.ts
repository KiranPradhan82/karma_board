/**
 * AI Tool Executor for Agentic Karma Space
 *
 * Executes tool calls from the AI against the KarmaBoard database.
 * Each tool function performs proper RBAC checks and returns structured results.
 */

import type { AiToolCall, AiToolResult } from "./ai-tools";
import { encrypt } from "./encryption";

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
  const restrictedTools = ["create_project", "update_project", "add_project_member"];
  if (role === "SUPERADMIN" || role === "ADMIN") return true;
  return !restrictedTools.includes(toolName);
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
    save_github_config: "🚀",
    save_database_config: "🗄️",
  };
  return icons[toolName] || "🔧";
}
