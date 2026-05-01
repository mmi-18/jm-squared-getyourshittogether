"use server";

/**
 * Server actions for tag CRUD. All ownership-checked via `requireUser()`.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const revalidate = () => revalidatePath("/matrix");

export async function createTag(input: {
  name: string;
  color?: string;
  parentId?: string | null;
  inheritColor?: boolean;
}) {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  // Validate parent ownership (if any).
  if (input.parentId) {
    const parent = await db.tag.findFirst({
      where: { id: input.parentId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent tag not found");
  }

  const last = await db.tag.findFirst({
    where: {
      userId: user.id,
      parentId: input.parentId ?? null,
      deletedAt: null,
    },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await db.tag.create({
    data: {
      userId: user.id,
      name,
      color: input.color ?? "#6b7280",
      parentId: input.parentId ?? null,
      // Root tags can't inherit (matches the artifact's invariant).
      inheritColor: input.parentId ? input.inheritColor ?? false : false,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  revalidate();
  return created;
}

export async function updateTag(input: {
  id: string;
  name?: string;
  color?: string;
  parentId?: string | null;
  inheritColor?: boolean;
}) {
  const user = await requireUser();
  const tag = await db.tag.findFirst({
    where: { id: input.id, userId: user.id, deletedAt: null },
    select: { id: true, parentId: true },
  });
  if (!tag) throw new Error("Tag not found");

  // If setting a new parent, validate ownership and reject cycles.
  if (input.parentId) {
    if (input.parentId === input.id) throw new Error("A tag can't be its own parent");
    const parent = await db.tag.findFirst({
      where: { id: input.parentId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent tag not found");

    // Walk up the would-be-parent chain. If we hit the tag we're editing,
    // the new parent is actually a descendant → cycle.
    let cursor: string | null = input.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === input.id) throw new Error("Would create a tag cycle");
      if (seen.has(cursor)) break; // existing cycle in DB; bail
      seen.add(cursor);
      const next: { parentId: string | null } | null = await db.tag.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = next?.parentId ?? null;
    }
  }

  await db.tag.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.inheritColor !== undefined
        ? {
            // Roots can't inherit. Use the new parentId if provided, else the
            // existing one, to decide.
            inheritColor:
              (input.parentId ?? tag.parentId) ? input.inheritColor : false,
          }
        : {}),
    },
  });
  revalidate();
}

/**
 * Soft-delete a tag. Children are reparented to the deleted tag's parent
 * (their grandparent, or null for new roots). TaskTag rows referencing the
 * deleted tag are removed — tasks lose this tag but aren't deleted.
 */
export async function deleteTag(id: string) {
  const user = await requireUser();
  const tag = await db.tag.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true, parentId: true },
  });
  if (!tag) throw new Error("Tag not found");

  await db.$transaction([
    // Reparent direct children. If the tag was a root, children become roots
    // (and must therefore have inheritColor=false).
    db.tag.updateMany({
      where: { parentId: id, userId: user.id, deletedAt: null },
      data: {
        parentId: tag.parentId,
        ...(tag.parentId === null ? { inheritColor: false } : {}),
      },
    }),
    // Detach from any tasks using it.
    db.taskTag.deleteMany({ where: { tagId: id } }),
    // Soft-delete the tag itself.
    db.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);
  revalidate();
}
