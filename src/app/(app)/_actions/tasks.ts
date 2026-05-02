"use server";

/**
 * Server actions for task CRUD.
 *
 * Every action enforces ownership via `requireUser()` + `userId` matching.
 * No RLS — the server is the trust boundary. Mutations soft-delete via
 * `deletedAt` (the sync engine reads this to propagate deletes across
 * devices in Phase 1B-γ).
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Quadrant } from "@/lib/types";

const REVALIDATE = ["/matrix"];
const revalidate = () => REVALIDATE.forEach((p) => revalidatePath(p));

export async function createTask(input: {
  title: string;
  quadrant: Quadrant;
  notes?: string;
  parentId?: string | null;
  tagIds?: string[];
  deadline?: string | null; // ISO yyyy-mm-dd
}) {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  if (![1, 2, 3, 4].includes(input.quadrant))
    throw new Error("Invalid quadrant");

  // Optional parent must belong to the same user.
  if (input.parentId) {
    const parent = await db.task.findFirst({
      where: { id: input.parentId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent not found");
  }

  // Place at end of the target list (max sortOrder + 1).
  const last = await db.task.findFirst({
    where: {
      userId: user.id,
      quadrant: input.quadrant,
      parentId: input.parentId ?? null,
      deletedAt: null,
    },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await db.task.create({
    data: {
      userId: user.id,
      title,
      notes: input.notes ?? "",
      quadrant: input.quadrant,
      parentId: input.parentId ?? null,
      sortOrder,
      deadline: input.deadline ? new Date(input.deadline) : null,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
  });
  revalidate();
  return created;
}

export async function updateTask(input: {
  id: string;
  title?: string;
  notes?: string;
  quadrant?: Quadrant;
  deadline?: string | null;
  parentId?: string | null;
  tagIds?: string[]; // when present, replaces the entire tag set
}) {
  const user = await requireUser();
  const existing = await db.task.findFirst({
    where: { id: input.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Task not found");

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: input.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.quadrant !== undefined ? { quadrant: input.quadrant } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.deadline !== undefined
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
      },
    });
    if (input.tagIds !== undefined) {
      await tx.taskTag.deleteMany({ where: { taskId: input.id } });
      if (input.tagIds.length) {
        await tx.taskTag.createMany({
          data: input.tagIds.map((tagId) => ({ taskId: input.id, tagId })),
        });
      }
    }
  });
  revalidate();
}

/**
 * Toggle the `completed` flag. Optimized for the common path (single field
 * write, no transaction) since it's the most-frequent mutation on the board.
 */
export async function toggleTaskCompleted(id: string) {
  const user = await requireUser();
  const task = await db.task.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { completed: true },
  });
  if (!task) throw new Error("Task not found");
  await db.task.update({
    where: { id },
    data: { completed: !task.completed },
  });
  revalidate();
}

/**
 * Soft-delete. Cascades to subtasks via the same call (parent_id FK has
 * onDelete: Cascade for hard deletes, but soft deletes need explicit
 * recursion). Returns the list of soft-deleted ids so the caller can
 * later pass them to `restoreTasks` to undo the deletion.
 */
export async function deleteTask(id: string): Promise<{ deletedIds: string[] }> {
  const user = await requireUser();
  const target = await db.task.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!target) throw new Error("Task not found");

  const ids = await collectDescendants(id, user.id);
  const allIds = [id, ...ids];
  await db.task.updateMany({
    where: { id: { in: allIds } },
    data: { deletedAt: new Date() },
  });
  revalidate();
  return { deletedIds: allIds };
}

/**
 * Undo a soft-delete. Sets `deletedAt = null` on every id in the list
 * that the caller owns and was previously soft-deleted. Used by the
 * undo toast after a delete.
 */
export async function restoreTasks(ids: string[]) {
  const user = await requireUser();
  if (ids.length === 0) return;
  await db.task.updateMany({
    where: {
      id: { in: ids },
      userId: user.id,
      // Only restore actually-deleted rows. Skipping live rows is a
      // no-op; we don't want to accidentally overwrite a freshly-edited
      // task with a stale state.
      deletedAt: { not: null },
    },
    data: { deletedAt: null },
  });
  revalidate();
}

async function collectDescendants(rootId: string, userId: string): Promise<string[]> {
  const direct = await db.task.findMany({
    where: { parentId: rootId, userId, deletedAt: null },
    select: { id: true },
  });
  const all = [...direct.map((t) => t.id)];
  for (const child of direct) {
    all.push(...(await collectDescendants(child.id, userId)));
  }
  return all;
}

/**
 * Move a task to a new quadrant (cascades the change to all descendants so
 * the subtree stays in one quadrant). Used by drag-and-drop across
 * quadrants.
 */
export async function moveTaskToQuadrant(id: string, quadrant: Quadrant) {
  const user = await requireUser();
  if (![1, 2, 3, 4].includes(quadrant)) throw new Error("Invalid quadrant");
  const target = await db.task.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!target) throw new Error("Task not found");
  const ids = await collectDescendants(id, user.id);
  await db.task.updateMany({
    where: { id: { in: [id, ...ids] } },
    data: { quadrant },
  });
  revalidate();
}

/**
 * Drag-to-nest: set `parentId` of `childId` to `newParentId`. Cycle
 * prevention checks both that the new parent isn't the child itself and
 * that it isn't a descendant of the child. The child's quadrant (and
 * the entire descendant subtree) snaps to the new parent's quadrant —
 * subtasks always live in the same quadrant as their parent.
 *
 * `newParentId === null` un-nests. Optional `newQuadrant` overrides the
 * destination quadrant when un-nesting (used by subtask DnD: drag a
 * subtask into the empty body of a different quadrant → it becomes
 * top-level in that quadrant).
 */
export async function nestTask(input: {
  childId: string;
  newParentId: string | null;
  newQuadrant?: Quadrant;
}) {
  const user = await requireUser();

  const child = await db.task.findFirst({
    where: { id: input.childId, userId: user.id, deletedAt: null },
    select: { id: true, parentId: true, quadrant: true },
  });
  if (!child) throw new Error("Task not found");

  if (input.newParentId) {
    if (input.newParentId === input.childId) {
      throw new Error("Can't nest a task into itself");
    }
    const newParent = await db.task.findFirst({
      where: {
        id: input.newParentId,
        userId: user.id,
        deletedAt: null,
      },
      select: { id: true, quadrant: true },
    });
    if (!newParent) throw new Error("New parent not found");

    const descendants = await collectDescendants(input.childId, user.id);
    if (descendants.includes(input.newParentId)) {
      throw new Error("Can't nest into a descendant");
    }

    const last = await db.task.findFirst({
      where: {
        parentId: input.newParentId,
        userId: user.id,
        deletedAt: null,
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    await db.$transaction([
      db.task.updateMany({
        where: { id: { in: [input.childId, ...descendants] } },
        data: { quadrant: newParent.quadrant },
      }),
      db.task.update({
        where: { id: input.childId },
        data: { parentId: input.newParentId, sortOrder },
      }),
    ]);
  } else {
    // Un-nest. Use newQuadrant override if provided (subtask dragged
    // into another quadrant); else stay in current quadrant.
    const targetQuadrant: Quadrant =
      (input.newQuadrant ?? child.quadrant) as Quadrant;
    if (![1, 2, 3, 4].includes(targetQuadrant)) {
      throw new Error("Invalid quadrant");
    }

    const last = await db.task.findFirst({
      where: {
        userId: user.id,
        quadrant: targetQuadrant,
        parentId: null,
        deletedAt: null,
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    // If the destination quadrant differs, cascade the change to the
    // entire subtree so subtasks travel with the un-nested task.
    if (targetQuadrant !== child.quadrant) {
      const descendants = await collectDescendants(input.childId, user.id);
      await db.task.updateMany({
        where: { id: { in: [input.childId, ...descendants] } },
        data: { quadrant: targetQuadrant },
      });
    }

    await db.task.update({
      where: { id: input.childId },
      data: { parentId: null, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
  }
  revalidate();
}

/**
 * Reorder tasks within a quadrant (and optional parent — for subtasks).
 * Pass the new ordered list of IDs; we rewrite their `sortOrder` to match
 * the array index. The DnD layer constructs this array from the post-drag
 * sortable state.
 *
 * Validates that every ID belongs to the caller (one query) before any
 * writes happen.
 */
export async function reorderTasks(input: {
  quadrant: Quadrant;
  parentId: string | null;
  orderedIds: string[];
}) {
  const user = await requireUser();
  if (input.orderedIds.length === 0) return;

  const owned = await db.task.findMany({
    where: { id: { in: input.orderedIds }, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (owned.length !== input.orderedIds.length) {
    throw new Error("Some tasks are not owned by user or were deleted");
  }

  // One UPDATE per task. With ~20-30 tasks per quadrant this is fine; we
  // can switch to a CASE-WHEN bulk update if it ever becomes a hotspot.
  await db.$transaction(
    input.orderedIds.map((id, idx) =>
      db.task.update({
        where: { id },
        data: {
          sortOrder: idx,
          quadrant: input.quadrant,
          parentId: input.parentId,
        },
      }),
    ),
  );
  revalidate();
}
