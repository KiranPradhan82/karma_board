import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, getClientIp, logActivity } from '@/lib/api-auth';
import { notifyClient } from '@/lib/notify-client';

/**
 * Todo status workflow:
 *
 *   PENDING ──▶ IN_PROGRESS ──▶ PENDING_REVIEW ──▶ COMPLETED
 *      ▲              │                   │               │
 *      └──────────────┘                   │               │
 *             (member/SA)                 │               │
 *                                         │               │
 *                              SA confirms ─┘               │
 *                                         │               │
 *                              SA rejects ──┘───▶ IN_PROGRESS
 *                                         │
 *                              SA direct: any ──▶ COMPLETED (no review needed)
 *
 * - Members can: PENDING→IN_PROGRESS, IN_PROGRESS→PENDING_REVIEW, IN_PROGRESS→PENDING
 * - ADMIN/SUPERADMIN can transition any direction
 * - Only SUPERADMIN can confirm (PENDING_REVIEW→COMPLETED) or directly mark COMPLETED
 * - Client notification sent ONLY when status reaches COMPLETED
 */

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'];

// Allowed transitions for non-SUPERADMIN users
const MEMBER_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'PENDING_REVIEW'],
  PENDING_REVIEW: [], // Only SUPERADMIN can act on PENDING_REVIEW
  COMPLETED: [],      // Terminal state
};

// PATCH /api/projects/[id]/todos/[todoId] — Update a todo (toggle status, edit fields, reorder)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id: projectId, todoId } = await params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS "ProjectTodo" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "assigneeId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "dueDate" DATETIME, "sortOrder" INTEGER NOT NULL DEFAULT 0, "reviewedBy" TEXT, "reviewedAt" DATETIME, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`, args: [] });

    // Verify project access
    const projectCheck = await client.execute({
      sql: `SELECT p.id, p.name FROM "Project" p
            WHERE p.id = ?
            AND (p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)
                 OR ? IN ('SUPERADMIN', 'ADMIN'))`,
      args: [projectId, user.id, user.role],
    });

    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get existing todo
    const existing = await client.execute({
      sql: `SELECT * FROM "ProjectTodo" WHERE id = ? AND "projectId" = ?`,
      args: [todoId, projectId],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Todo not found' }, { status: 404 });
    }

    const todo = existing.rows[0];
    const body = await request.json();
    const isSuperAdmin = user.role === 'SUPERADMIN';

    // Validate assignee (if provided and changed)
    if (body.assigneeId !== undefined && body.assigneeId !== todo.assigneeId) {
      if (body.assigneeId) {
        const memberCheck = await client.execute({
          sql: `SELECT id FROM "ProjectMember" WHERE "projectId" = ? AND "userId" = ? AND "removedAt" IS NULL`,
          args: [projectId, body.assigneeId],
        });
        if (memberCheck.rows.length === 0) {
          return NextResponse.json({ success: false, error: 'Assignee must be a project member' }, { status: 400 });
        }
      }
    }

    // Validate priority
    const validPriorities = ['HIGH', 'MEDIUM', 'LOW'];
    if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ success: false, error: 'Invalid priority' }, { status: 400 });
    }

    // Validate status and enforce transition rules
    let newStatus: string | undefined;
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }

      const currentStatus = todo.status as string;

      if (body.status !== currentStatus) {
        if (!isSuperAdmin) {
          // Non-SUPERADMIN: check allowed transitions
          const allowed = MEMBER_TRANSITIONS[currentStatus] || [];
          if (!allowed.includes(body.status)) {
            if (currentStatus === 'PENDING_REVIEW') {
              return NextResponse.json(
                { success: false, error: 'This task is pending review. Only a super admin can confirm or reject it.' },
                { status: 403 }
              );
            }
            if (currentStatus === 'COMPLETED') {
              return NextResponse.json(
                { success: false, error: 'Completed tasks cannot be reopened by members. Contact a super admin.' },
                { status: 403 }
              );
            }
            return NextResponse.json(
              { success: false, error: `Cannot transition from ${currentStatus} to ${body.status}` },
              { status: 400 }
            );
          }
        }

        // SUPERADMIN: all transitions allowed, but track review metadata
        if (body.status === 'COMPLETED' && currentStatus !== 'PENDING_REVIEW') {
          // Direct completion by SUPERADMIN (bypassing review)
          body._directComplete = true;
        }
      }

      newStatus = body.status;
    }

    // Build SET clause dynamically
    const setClauses: string[] = ['"updatedAt" = datetime(\'now\')'];
    const args: unknown[] = [];
    const detailsParts: string[] = [];

    if (body.title !== undefined) {
      setClauses.push('title = ?');
      args.push(body.title.trim());
      if (body.title.trim() !== (todo.title as string)) {
        detailsParts.push(`renamed to "${body.title.trim()}"`);
      }
    }

    if (body.description !== undefined) {
      setClauses.push('"description" = ?');
      args.push(body.description?.trim() || null);
    }

    if (body.assigneeId !== undefined) {
      setClauses.push('"assigneeId" = ?');
      args.push(body.assigneeId || null);
      if (body.assigneeId !== (todo.assigneeId as string)) {
        detailsParts.push(body.assigneeId ? 'reassigned' : 'unassigned');
      }
    }

    if (body.priority !== undefined) {
      setClauses.push('priority = ?');
      args.push(body.priority);
      if (body.priority !== (todo.priority as string)) {
        detailsParts.push(`priority set to ${body.priority}`);
      }
    }

    if (body.dueDate !== undefined) {
      setClauses.push('"dueDate" = ?');
      args.push(body.dueDate || null);
    }

    if (body.sortOrder !== undefined) {
      setClauses.push('"sortOrder" = ?');
      args.push(body.sortOrder);
    }

    if (newStatus !== undefined) {
      setClauses.push('status = ?');
      args.push(newStatus);

      const statusLabels: Record<string, string> = {
        PENDING: 'Pending',
        IN_PROGRESS: 'In Progress',
        PENDING_REVIEW: 'Pending Review',
        COMPLETED: 'Completed',
      };
      detailsParts.push(`status changed to ${statusLabels[newStatus]}`);

      // Track review metadata when reaching COMPLETED
      if (newStatus === 'COMPLETED') {
        setClauses.push('"reviewedBy" = ?');
        args.push(user.id);
        setClauses.push('"reviewedAt" = datetime(\'now\')');
      }

      // Clear review metadata if reverting from COMPLETED or PENDING_REVIEW
      if (newStatus !== 'COMPLETED' && (todo.status as string) === 'COMPLETED') {
        setClauses.push('"reviewedBy" = NULL');
        setClauses.push('"reviewedAt" = NULL');
      }
      if (newStatus === 'IN_PROGRESS' && (todo.status as string) === 'PENDING_REVIEW') {
        // Rejected by super admin — clear review metadata
        setClauses.push('"reviewedBy" = NULL');
        setClauses.push('"reviewedAt" = NULL');
      }
    }

    if (setClauses.length <= 1) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    args.push(todoId);

    await client.execute({
      sql: `UPDATE "ProjectTodo" SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Log activity
    try {
      let actionType = 'UPDATE_TODO';
      if (newStatus === 'COMPLETED') {
        actionType = 'COMPLETE_TODO';
      } else if (newStatus === 'PENDING_REVIEW') {
        actionType = 'SUBMIT_TODO_FOR_REVIEW';
      } else if (newStatus === 'IN_PROGRESS' && (todo.status as string) === 'PENDING_REVIEW') {
        actionType = 'REJECT_TODO_REVIEW';
      }
      await logActivity({
        userId: user.id,
        action: actionType,
        details: `Updated todo "${todo.title as string}"${detailsParts.length > 0 ? `: ${detailsParts.join(', ')}` : ''}`,
        entity: 'project',
        entityId: projectId,
        ipAddress: ip,
        tursoClient: client,
      });
    } catch {
      // Non-critical
    }

    // Notify client ONLY when status reaches COMPLETED
    if (newStatus === 'COMPLETED' && (todo.status as string) !== 'COMPLETED') {
      const directBySA = isSuperAdmin && (todo.status as string) !== 'PENDING_REVIEW';
      const message = directBySA
        ? `Task completed: ${todo.title as string}`
        : `Task completed (reviewed): ${todo.title as string}`;

      notifyClient({
        projectId,
        type: 'COMPLETED',
        message,
        sentBy: user.id,
      });
    }

    return NextResponse.json({ success: true, message: 'Todo updated' });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]/todos/[todoId]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/todos/[todoId] — Delete a todo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // Only ADMIN and SUPERADMIN can delete todos
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return NextResponse.json({ success: false, error: 'Only admins can delete todos' }, { status: 403 });
    }

    const { id: projectId, todoId } = await params;
    const client = getTursoClient();
    const ip = getClientIp(request);

    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS "ProjectTodo" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "assigneeId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "dueDate" DATETIME, "sortOrder" INTEGER NOT NULL DEFAULT 0, "reviewedBy" TEXT, "reviewedAt" DATETIME, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`, args: [] });

    // Verify project access
    const projectCheck = await client.execute({
      sql: `SELECT p.id FROM "Project" p
            WHERE p.id = ?
            AND (p.id IN (SELECT "projectId" FROM "ProjectMember" WHERE "userId" = ? AND "removedAt" IS NULL)
                 OR ? IN ('SUPERADMIN', 'ADMIN'))`,
      args: [projectId, user.id, user.role],
    });

    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Project not found or access denied' }, { status: 404 });
    }

    // Get todo title for activity log
    const todoInfo = await client.execute({
      sql: `SELECT title FROM "ProjectTodo" WHERE id = ? AND "projectId" = ?`,
      args: [todoId, projectId],
    });

    if (todoInfo.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Todo not found' }, { status: 404 });
    }

    await client.execute({
      sql: `DELETE FROM "ProjectTodo" WHERE id = ? AND "projectId" = ?`,
      args: [todoId, projectId],
    });

    // Log activity
    try {
      await logActivity({
        userId: user.id,
        action: 'DELETE_TODO',
        details: `Deleted todo "${todoInfo.rows[0].title as string}"`,
        entity: 'project',
        entityId: projectId,
        ipAddress: ip,
        tursoClient: client,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json({ success: true, message: 'Todo deleted' });
  } catch (error) {
    console.error('[DELETE /api/projects/[id]/todos/[todoId]] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}