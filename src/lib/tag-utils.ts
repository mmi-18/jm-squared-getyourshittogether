/**
 * Tag tree helpers — building hierarchical structures from the flat DB rows.
 */

import type { Tag } from "@prisma/client";

export type TagNode = Tag & { children: TagNode[]; depth: number };

/**
 * Build a tree from a flat list of tags. Sort within each level by
 * (sortOrder, createdAt). Stable.
 */
export function buildTagTree(tags: Tag[]): TagNode[] {
  const byId = new Map<string, TagNode>();
  for (const t of tags) byId.set(t.id, { ...t, children: [], depth: 0 });

  const roots: TagNode[] = [];
  for (const t of tags) {
    const node = byId.get(t.id)!;
    if (t.parentId && byId.has(t.parentId)) {
      const parent = byId.get(t.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Recursively sort children.
  const sortByOrder = (a: TagNode, b: TagNode) =>
    a.sortOrder - b.sortOrder ||
    a.createdAt.getTime() - b.createdAt.getTime();
  const sortRecursive = (nodes: TagNode[]) => {
    nodes.sort(sortByOrder);
    nodes.forEach((n) => {
      // Set depth correctly on subtrees built via DFS (the linear loop above
      // didn't respect order).
      n.children.forEach((c) => (c.depth = n.depth + 1));
      sortRecursive(n.children);
    });
  };
  sortRecursive(roots);
  return roots;
}

/**
 * Flatten a tag tree into a depth-prefixed list, preserving DFS order.
 * Useful for listing tags in tree order in the manager modal.
 */
export function flattenTree(roots: TagNode[]): TagNode[] {
  const out: TagNode[] = [];
  const walk = (nodes: TagNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * Set of tag IDs that are descendants of `rootId` (inclusive of rootId).
 * Used by the filter strip: filtering by a parent tag should match tasks
 * tagged with any descendant.
 */
export function descendantTagIds(rootId: string, tags: Tag[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of tags) {
    if (!t.parentId) continue;
    const list = childrenByParent.get(t.parentId);
    if (list) list.push(t.id);
    else childrenByParent.set(t.parentId, [t.id]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = childrenByParent.get(cur) ?? [];
    for (const k of kids) {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    }
  }
  return out;
}
