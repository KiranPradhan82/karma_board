import { getTursoClient } from "./api-auth";

type TursoClient = ReturnType<typeof getTursoClient>;

interface NotifyParams {
  /** The recipient user ID */
  userId: string;
  /** Notification type: PROJECT_ASSIGNED, ROLE_CHANGED, PROJECT_REMOVED, PROJECT_CREATED, etc. */
  type: string;
  /** Short title shown in notification list */
  title: string;
  /** Optional detailed message */
  message?: string;
  /** Optional link to navigate to when clicked (e.g., /dashboard/projects/xyz) */
  link?: string;
}

/**
 * Send an in-app notification to a specific user.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function notifyUser(params: NotifyParams): Promise<void> {
  try {
    const client = getTursoClient();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO "Notification" (id, "userId", type, title, message, link, "read", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [id, params.userId, params.type, params.title, params.message || null, params.link || null, now],
    });
  } catch (error) {
    // Fire-and-forget — never block the caller
    console.error("[notifyUser] Error:", error);
  }
}

/**
 * Notify multiple users at once (e.g., all super admins).
 */
export async function notifyUsers(paramsList: NotifyParams[]): Promise<void> {
  await Promise.allSettled(paramsList.map((p) => notifyUser(p)));
}

/**
 * Convenience: notify a user about being assigned to a project.
 */
export function notifyProjectAssigned(params: {
  userId: string;
  projectName: string;
  projectId: string;
  role: string;
  assignedByName: string;
}) {
  return notifyUser({
    userId: params.userId,
    type: "PROJECT_ASSIGNED",
    title: `Assigned to "${params.projectName}"`,
    message: `${params.assignedByName} assigned you as ${params.role} in the project "${params.projectName}".`,
    link: `/dashboard/projects/${params.projectId}`,
  });
}

/**
 * Convenience: notify a user about their role change in a project.
 */
export function notifyRoleChanged(params: {
  userId: string;
  projectName: string;
  projectId: string;
  oldRole: string;
  newRole: string;
  changedByName: string;
}) {
  return notifyUser({
    userId: params.userId,
    type: "ROLE_CHANGED",
    title: `Role changed in "${params.projectName}"`,
    message: `${params.changedByName} changed your role from ${params.oldRole} to ${params.newRole} in "${params.projectName}".`,
    link: `/dashboard/projects/${params.projectId}`,
  });
}

/**
 * Convenience: notify a user about being removed from a project.
 */
export function notifyRemovedFromProject(params: {
  userId: string;
  projectName: string;
  removedByName: string;
}) {
  return notifyUser({
    userId: params.userId,
    type: "PROJECT_REMOVED",
    title: `Removed from "${params.projectName}"`,
    message: `${params.removedByName} removed you from the project "${params.projectName}".`,
  });
}

/**
 * Convenience: notify a user about a new project creation (they were auto-assigned).
 */
export function notifyNewProject(params: {
  userId: string;
  projectName: string;
  projectId: string;
  role: string;
  creatorName: string;
}) {
  return notifyUser({
    userId: params.userId,
    type: "NEW_PROJECT",
    title: `New project: "${params.projectName}"`,
    message: `${params.creatorName} created "${params.projectName}" and you were assigned as ${params.role}.`,
    link: `/dashboard/projects/${params.projectId}`,
  });
}
