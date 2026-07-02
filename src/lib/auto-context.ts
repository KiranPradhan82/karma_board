/**
 * Auto-context injection for AI chat.
 *
 * Builds a comprehensive context block containing:
 * - Current user info (name, role, access level)
 * - All projects the user has access to
 * - Team members and their roles per project
 * - Project status summaries
 *
 * This context is prepended to the system prompt so the AI model
 * always has full awareness of the organizational structure.
 */

import { getTursoClient } from "@/lib/api-auth";

export interface AutoContextData {
  userId: string;
  userName: string;
  userRole: string;
  userEmail?: string;
  projects: ProjectContext[];
  allMembers: MemberContext[];
}

interface ProjectContext {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  clientName?: string;
  deadline?: string;
  memberCount: number;
  todoSummary: { pending: number; inProgress: number; completed: number; total: number };
  userRoleInProject: string;
}

interface MemberContext {
  id: string;
  name: string;
  email?: string;
  role: string;
  jobTitle?: string;
  skills?: string;
  isActive: boolean;
}

/**
 * Build auto-context for a given user. Fetches all relevant data from DB.
 */
export async function buildAutoContext(
  userId: string,
  userRole: string,
  projectId?: string | null,
): Promise<string> {
  try {
    const client = getTursoClient();

    // 1. Get user info
    const userResult = await client.execute({
      sql: `SELECT name, email, role FROM "User" WHERE id = ?`,
      args: [userId],
    });
    const user = userResult.rows[0];
    const userName = (user?.name as string) || "Unknown";
    const userEmail = user?.email as string | undefined;

    // 2. Get projects the user can access
    let projectsQuery: string;
    let projectsArgs: string[];

    if (userRole === "SUPERADMIN") {
      projectsQuery = `SELECT id, name, description, status, priority, "clientName", deadline
                       FROM "Project" ORDER BY name`;
      projectsArgs = [];
    } else {
      projectsQuery = `SELECT p.id, p.name, p.description, p.status, p.priority, p."clientName", p.deadline
                       FROM "Project" p
                       INNER JOIN "ProjectMember" pm ON pm."projectId" = p.id
                       WHERE pm."userId" = ? AND pm."removedAt" IS NULL
                       ORDER BY p.name`;
      projectsArgs = [userId];
    }

    const projectsResult = await client.execute({
      sql: projectsQuery,
      args: projectsArgs,
    });

    // 3. For each project, get member count, todo summary, and user's role
    const projectContexts: ProjectContext[] = [];
    for (const proj of projectsResult.rows) {
      const pid = proj.id as string;

      // Member count
      const mcResult = await client.execute({
        sql: `SELECT COUNT(*) as cnt FROM "ProjectMember" WHERE "projectId" = ? AND "removedAt" IS NULL`,
        args: [pid],
      });
      const memberCount = Number(mcResult.rows[0]?.cnt || 0);

      // Todo summary
      const todoResult = await client.execute({
        sql: `SELECT
                SUM(CASE WHEN status IN ('PENDING', 'PENDING_REVIEW') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress,
                SUM(CASE WHEN status IN ('COMPLETED', 'DONE') THEN 1 ELSE 0 END) as completed,
                COUNT(*) as total
              FROM "ProjectTodo" WHERE "projectId" = ?`,
        args: [pid],
      });
      const todoRow = todoResult.rows[0];
      const todoSummary = {
        pending: Number(todoRow?.pending || 0),
        inProgress: Number(todoRow?.inProgress || 0),
        completed: Number(todoRow?.completed || 0),
        total: Number(todoRow?.total || 0),
      };

      // User's role in this project
      let userRoleInProject = userRole;
      if (userRole !== "SUPERADMIN") {
        const roleResult = await client.execute({
          sql: `SELECT role FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
          args: [pid, userId],
        });
        if (roleResult.rows.length > 0) {
          userRoleInProject = roleResult.rows[0].role as string;
        }
      }

      projectContexts.push({
        id: pid,
        name: proj.name as string,
        description: (proj.description as string) || undefined,
        status: proj.status as string,
        priority: proj.priority as string,
        clientName: (proj.clientName as string) || undefined,
        deadline: (proj.deadline as string) || undefined,
        memberCount,
        todoSummary,
        userRoleInProject,
      });
    }

    // 4. Get all active team members (for SUPERADMIN/ADMIN) or just project members
    let membersResult;
    if (userRole === "SUPERADMIN" || userRole === "ADMIN") {
      membersResult = await client.execute({
        sql: `SELECT id, name, email, role, "jobTitle", skills, "isActive"
              FROM "User" WHERE "deletedAt" IS NULL ORDER BY name`,
        args: [],
      });
    } else {
      membersResult = await client.execute({
        sql: `SELECT DISTINCT u.id, u.name, u.email, u.role, u."jobTitle", u.skills, u."isActive"
              FROM "User" u
              INNER JOIN "ProjectMember" pm ON pm."userId" = u.id
              WHERE pm."userId" = ? OR pm."projectId" IN (${projectsResult.rows.map(() => "?").join(",")})
              GROUP BY u.id ORDER BY u.name`,
        args: [userId, ...projectsResult.rows.map((r) => r.id as string)],
      });
    }

    const allMembers: MemberContext[] = membersResult.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      email: (r.email as string) || undefined,
      role: r.role as string,
      jobTitle: (r.jobTitle as string) || undefined,
      skills: (r.skills as string) || undefined,
      isActive: Boolean(r.isActive),
    }));

    // 5. Build the context string
    return formatAutoContext({
      userId,
      userName,
      userRole,
      userEmail,
      projects: projectContexts,
      allMembers,
    }, projectId);
  } catch (error) {
    console.error("[auto-context] Error building context:", error);
    return "";
  }
}

function formatAutoContext(
  data: AutoContextData,
  activeProjectId?: string | null,
): string {
  const lines: string[] = [];

  lines.push("## ORGANIZATIONAL CONTEXT");
  lines.push("");
  lines.push(`**Current User:** ${data.userName} (${data.userRole})`);
  if (data.userEmail) lines.push(`**User Email:** ${data.userEmail}`);
  lines.push(`**Access Level:** ${data.userRole === "SUPERADMIN" ? "Full system access — all projects, all members, all settings" : data.userRole === "ADMIN" ? "Team management — projects, members, AI configuration" : "Standard — assigned projects and personal tasks only"}`);
  lines.push("");

  if (data.allMembers.length > 0) {
    lines.push("### Team Members");
    lines.push("| Name | Role | Job Title | Skills | Status |");
    lines.push("|------|------|-----------|--------|--------|");
    for (const m of data.allMembers) {
      lines.push(`| ${m.name} | ${m.role} | ${m.jobTitle || "—"} | ${m.skills || "—"} | ${m.isActive ? "Active" : "Inactive"} |`);
    }
    lines.push("");
  }

  if (data.projects.length > 0) {
    lines.push("### Projects");
    for (const p of data.projects) {
      const isActive = p.id === activeProjectId;
      const marker = isActive ? " ⬅️ **[ACTIVE]**" : "";
      lines.push(`#### ${p.name}${marker}`);
      lines.push(`- **Status:** ${p.status} | **Priority:** ${p.priority} | **Team:** ${p.memberCount} members`);
      if (p.clientName) lines.push(`- **Client:** ${p.clientName}`);
      if (p.deadline) lines.push(`- **Deadline:** ${p.deadline}`);
      if (p.description) lines.push(`- **Description:** ${p.description}`);
      lines.push(`- **Tasks:** ${p.todoSummary.completed}/${p.todoSummary.total} completed, ${p.todoSummary.inProgress} in progress, ${p.todoSummary.pending} pending`);
      if (isActive && p.userRoleInProject) {
        lines.push(`- **Your Role in This Project:** ${p.userRoleInProject}`);
      }
      lines.push("");
    }
  }

  lines.push("### Access Control Rules");
  lines.push("- You MUST respect role-based access. The current user can only perform actions their role allows.");
  lines.push("- SUPERADMIN: Full access to everything.");
  lines.push("- ADMIN: Can manage projects, team, AI settings. Cannot access system-level settings.");
  lines.push("- MEMBER: Can only work within assigned projects. Cannot manage team or settings.");
  lines.push("- Never reveal, suggest, or attempt to bypass access controls.");

  return lines.join("\n");
}