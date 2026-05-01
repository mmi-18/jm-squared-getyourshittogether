import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MatrixClient } from "./MatrixClient";

/**
 * The main app page — the 2×2 Eisenhower matrix.
 *
 * Server-rendered shell: pulls the user's tasks + tags from Postgres on
 * every navigation, hands them to the client component as initial data.
 * The client owns interactions (create / toggle / delete) and triggers
 * `router.refresh()` after each server action so the next read picks up
 * the new state.
 *
 * In Phase 1B-γ the IndexedDB sync engine takes over hydration and the
 * server fetch becomes a one-time bootstrap; for now the simpler
 * server-fetch-on-every-render flow is what proves the loop works.
 */
export default async function MatrixPage() {
  const user = await requireUser();

  // Pull live tasks + tags in parallel. Soft-deleted rows are excluded.
  const [tasks, tags] = await Promise.all([
    db.task.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ quadrant: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: { tags: { select: { tagId: true } } },
    }),
    db.tag.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // Flatten the join rows into a tagIds array per task — friendlier shape
  // for the client component (which doesn't need TaskTag.taskId).
  const tasksForClient = tasks.map((t) => ({
    ...t,
    tagIds: t.tags.map((j) => j.tagId),
  }));

  return (
    <MatrixClient
      initialTasks={tasksForClient}
      initialTags={tags}
      userEmail={user.email}
    />
  );
}
