import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getTursoClient, getClientIp, logActivity } from '@/lib/api-auth';
import { notifyClient } from '@/lib/notify-client';

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

    // Validate status
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'DONE'];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
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

    if (body.status !== undefined) {
      setClauses.push('status = ?');
      args.push(body.status);
      if (body.status !== (todo.status as string)) {
        const statusLabels: Record<string, string> = {
          PENDING: 'Pending',
          IN_PROGRESS: 'In Progress',
          DONE: 'Done',
        };
        detailsParts.push(`status changed to ${statusLabels[body.status]}`);
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
      const actionType = body.status === 'DONE' ? 'COMPLETE_TODO' : 'UPDATE_TODO';
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

    // Notify client if status changed to DONE
    if (body.status === 'DONE' && (todo.status as string) !== 'DONE') {
      notifyClient({
        projectId,
        type: 'COMPLETED',
        message: `Task completed: ${todo.title as string}`,
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