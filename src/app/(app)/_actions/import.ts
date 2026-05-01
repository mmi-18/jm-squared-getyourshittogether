"use server";

/**
 * One-time importer for data exported from the Eisenhower-matrix Claude
 * artifact (the single-file HTML prototype). Accepts the artifact's JSON
 * shape:
 *
 *   { tasks: ArtifactTask[], tags: ArtifactTag[] }
 *
 * Where:
 *   ArtifactTask = { id, title, notes, tagIds, deadline, completed,
 *                    quadrant, subtasks: ArtifactTask[] }
 *   ArtifactTag  = { id, name, color, parentId, inheritColor }
 *
 * Mapping decisions:
 *   - Old artifact IDs are NOT preserved. We mint fresh cuids and keep an
 *     oldId → newId lookup so child references survive the rewrite.
 *   - Subtasks are flattened: the artifact stores them as nested arrays;
 *     our schema stores them as a flat self-referential parentId.
 *   - Order is preserved via array order — sortOrder is stamped from the
 *     position index as we walk.
 *   - Tags are inserted parents-before-children so the FK is satisfied.
 *   - Idempotent only via the user "wipes existing data" choice. There's
 *     no de-dup against the existing rows; the spec import is a one-time
 *     migration, not an incremental sync.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

type ArtifactTask = {
  id?: string;
  title?: unknown;
  notes?: unknown;
  tagIds?: unknown;
  deadline?: unknown;
  completed?: unknown;
  quadrant?: unknown;
  subtasks?: unknown;
};
type ArtifactTag = {
  id?: string;
  name?: unknown;
  color?: unknown;
  parentId?: unknown;
  inheritColor?: unknown;
};
type ArtifactPayload = { tasks?: unknown; tags?: unknown };

export async function importFromArtifact(input: {
  json: string;
  /** If true, soft-delete the user's existing tasks + tags before importing. */
  replace: boolean;
}): Promise<{ tagsImported: number; tasksImported: number }> {
  const user = await requireUser();

  let parsed: ArtifactPayload;
  try {
    parsed = JSON.parse(input.json);
  } catch {
    throw new Error("Invalid JSON — could not parse the file.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON must be an object with `tasks` and `tags` keys.");
  }

  const rawTags = Array.isArray(parsed.tags) ? (parsed.tags as ArtifactTag[]) : [];
  const rawTasks = Array.isArray(parsed.tasks) ? (parsed.tasks as ArtifactTask[]) : [];

  // ── Validate + normalize tags ─────────────────────────────────────────
  // Topological order: roots (parentId == null) first, then walk the tree.
  // Generate new IDs and a mapping so child parentId can be remapped.
  const tagIdMap = new Map<string, string>();
  const orderedTags: Array<{
    id: string;
    name: string;
    color: string;
    parentId: string | null;
    inheritColor: boolean;
    sortOrder: number;
  }> = [];

  const tagsById = new Map<string, ArtifactTag>();
  for (const t of rawTags) {
    if (!t || typeof t.id !== "string") continue;
    tagsById.set(t.id, t);
  }
  // Walk depth-first from each root.
  const visited = new Set<string>();
  const visit = (oldId: string, depth: number) => {
    if (visited.has(oldId)) return;
    visited.add(oldId);
    const t = tagsById.get(oldId);
    if (!t) return;
    const newId = cuidLike();
    tagIdMap.set(oldId, newId);
    const parentNew =
      typeof t.parentId === "string" ? tagIdMap.get(t.parentId) ?? null : null;
    orderedTags.push({
      id: newId,
      name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Untitled",
      color: typeof t.color === "string" ? t.color : "#6b7280",
      parentId: parentNew,
      inheritColor:
        typeof t.inheritColor === "boolean" && parentNew ? t.inheritColor : false,
      sortOrder: depth, // tweak later; doesn't have to be globally unique
    });
    for (const [otherId, otherTag] of tagsById) {
      if (otherTag.parentId === oldId) visit(otherId, depth + 1);
    }
  };
  for (const [oldId, t] of tagsById) {
    if (!t.parentId) visit(oldId, 0);
  }
  // Pick up orphans (parent missing in payload — treat as root).
  for (const oldId of tagsById.keys()) if (!visited.has(oldId)) visit(oldId, 0);

  // ── Validate + flatten tasks ──────────────────────────────────────────
  // Walk the recursive subtasks tree. Each task gets a fresh cuid, parentId
  // is mapped to its parent's new id (null at top level).
  type FlatTask = {
    id: string;
    parentId: string | null;
    title: string;
    notes: string;
    quadrant: number;
    completed: boolean;
    deadline: Date | null;
    sortOrder: number;
    tagIds: string[];
  };
  const flatTasks: FlatTask[] = [];

  const walkTasks = (
    list: ArtifactTask[],
    parentNewId: string | null,
    siblingIdx: number,
  ): number => {
    let order = siblingIdx;
    for (const t of list) {
      if (!t || typeof t !== "object") continue;
      const title = typeof t.title === "string" ? t.title.trim() : "";
      const quad = typeof t.quadrant === "number" ? t.quadrant : 4;
      if (!title) continue;
      if (![1, 2, 3, 4].includes(quad)) continue;

      const newId = cuidLike();
      const oldTagIds = Array.isArray(t.tagIds)
        ? (t.tagIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const mappedTagIds = oldTagIds
        .map((id) => tagIdMap.get(id))
        .filter((x): x is string => Boolean(x));

      const deadline =
        typeof t.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
          ? new Date(t.deadline + "T00:00:00Z")
          : null;

      flatTasks.push({
        id: newId,
        parentId: parentNewId,
        title,
        notes: typeof t.notes === "string" ? t.notes : "",
        quadrant: quad,
        completed: t.completed === true,
        deadline,
        sortOrder: order++,
        tagIds: mappedTagIds,
      });
      if (Array.isArray(t.subtasks) && t.subtasks.length) {
        walkTasks(t.subtasks as ArtifactTask[], newId, 0);
      }
    }
    return order;
  };
  walkTasks(rawTasks, null, 0);

  // ── Write everything in one transaction ───────────────────────────────
  await db.$transaction(async (tx) => {
    if (input.replace) {
      // Hard delete the user's data — soft-delete would leave orphan
      // task_tags and pollute the sync watermark. The user explicitly
      // opted in to "replace".
      await tx.taskTag.deleteMany({
        where: { task: { userId: user.id } },
      });
      await tx.task.deleteMany({ where: { userId: user.id } });
      await tx.tag.deleteMany({ where: { userId: user.id } });
    }

    // Tags: insert parents first (orderedTags is already topo-ordered).
    for (const t of orderedTags) {
      await tx.tag.create({
        data: {
          id: t.id,
          userId: user.id,
          name: t.name,
          color: t.color,
          parentId: t.parentId,
          inheritColor: t.inheritColor,
          sortOrder: t.sortOrder,
        },
      });
    }

    // Tasks: parents-before-children is guaranteed by walkTasks order.
    for (const t of flatTasks) {
      await tx.task.create({
        data: {
          id: t.id,
          userId: user.id,
          parentId: t.parentId,
          title: t.title,
          notes: t.notes,
          quadrant: t.quadrant,
          completed: t.completed,
          deadline: t.deadline,
          sortOrder: t.sortOrder,
          tags: t.tagIds.length
            ? { create: t.tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
      });
    }
  });

  revalidatePath("/matrix");
  return { tagsImported: orderedTags.length, tasksImported: flatTasks.length };
}

/**
 * Quick cuid-like generator. Prisma normally generates these via `@default(cuid())`
 * but we want to mint IDs in app code so we can keep a parent→child mapping
 * in the same pass.
 *
 * Format: `c` + 24 random base36 chars. Not cryptographically strong, but
 * fine for primary keys. (Real cuid2 includes a counter + entropy mix; we
 * don't need that for a single-user import.)
 */
function cuidLike(): string {
  const rand = () => Math.random().toString(36).slice(2);
  const ts = Date.now().toString(36);
  return ("c" + ts + rand() + rand()).slice(0, 25);
}
