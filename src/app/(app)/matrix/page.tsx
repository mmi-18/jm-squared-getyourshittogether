import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_FILTER_STATE, type FilterState } from "@/lib/types";
import { MatrixClient } from "./MatrixClient";

/**
 * The main app page — the 2×2 Eisenhower matrix.
 *
 * Server-rendered shell: pulls the user's tasks + tags + persisted settings
 * (theme, defaultFilters) from Postgres on every navigation, hands them to
 * the client component as initial data. The client owns interactions
 * (create / toggle / delete / drag-reorder / cross-quadrant move) and
 * triggers `router.refresh()` after each server action so the next read
 * picks up the new state.
 *
 * Phase 1B-γ will add the IndexedDB sync engine; this server fetch then
 * becomes a one-time bootstrap behind the scenes. For now the
 * fetch-on-every-render flow proves the loop end-to-end.
 */
export default async function MatrixPage() {
  const user = await requireUser();

  // Pull live tasks + tags + the user's persisted theme/filters in
  // parallel. Soft-deleted rows are excluded.
  const [tasks, tags, settings] = await Promise.all([
    db.task.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ quadrant: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: { tags: { select: { tagId: true } } },
    }),
    db.tag.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { theme: true, defaultFilters: true },
    }),
  ]);

  // Flatten the join rows into a tagIds array per task — friendlier shape
  // for the client component (which doesn't need TaskTag.taskId).
  const tasksForClient = tasks.map((t) => ({
    ...t,
    tagIds: t.tags.map((j) => j.tagId),
  }));

  // Parse defaultFilters defensively — JSONB is opaque, schemas evolve.
  const filters = parseFilterState(settings?.defaultFilters);

  return (
    <MatrixClient
      initialTasks={tasksForClient}
      initialTags={tags}
      userEmail={user.email}
      initialFilters={filters}
      initialTheme={settings?.theme ?? "system"}
    />
  );
}

function parseFilterState(raw: unknown): FilterState {
  if (!raw || typeof raw !== "object") return DEFAULT_FILTER_STATE;
  const r = raw as Record<string, unknown>;
  return {
    selectedTagIds: Array.isArray(r.selectedTagIds)
      ? (r.selectedTagIds as unknown[]).filter((x): x is string => typeof x === "string")
      : DEFAULT_FILTER_STATE.selectedTagIds,
    expandedTagIds: Array.isArray(r.expandedTagIds)
      ? (r.expandedTagIds as unknown[]).filter((x): x is string => typeof x === "string")
      : DEFAULT_FILTER_STATE.expandedTagIds,
    showCompleted:
      typeof r.showCompleted === "boolean" ? r.showCompleted : DEFAULT_FILTER_STATE.showCompleted,
    onlyWithDeadline:
      typeof r.onlyWithDeadline === "boolean"
        ? r.onlyWithDeadline
        : DEFAULT_FILTER_STATE.onlyWithDeadline,
  };
}
