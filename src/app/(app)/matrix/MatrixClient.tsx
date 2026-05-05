"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Undo2, X as XIcon } from "lucide-react";
import type { Tag } from "@prisma/client";
import { Theme } from "@prisma/client";
import { type FilterState, type Quadrant, QUADRANTS } from "@/lib/types";
import { descendantTagIds } from "@/lib/tag-utils";
import { passesDeadlineFilter, QUADRANT_ACCENT } from "@/lib/quadrant-utils";
import { cn } from "@/lib/utils";
import {
  createTask,
  deleteTask,
  moveTask,
  restoreTasks,
  toggleTaskCompleted,
} from "../_actions/tasks";
import { updateUserFilters } from "../_actions/settings";
import { QuadrantPanel, type RenderedTask } from "@/components/matrix/QuadrantPanel";
import { Header, applyTheme } from "@/components/matrix/Header";
import { FilterStrip } from "@/components/matrix/FilterStrip";
import { TagManagerModal } from "@/components/matrix/TagManagerModal";
import { TaskCard, type TaskWithTagIds } from "@/components/matrix/TaskCard";
import { EditTaskModal } from "@/components/matrix/EditTaskModal";

const COLLAPSED_STORAGE_KEY = "gyst-collapsed-tasks";

type UndoAction = { description: string; run: () => Promise<void> };

export function MatrixClient({
  initialTasks,
  initialTags,
  userEmail,
  initialFilters,
  initialTheme,
}: {
  initialTasks: TaskWithTagIds[];
  initialTags: Tag[];
  userEmail: string;
  initialFilters: FilterState;
  initialTheme: Theme;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Filters ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [lastServerSync, setLastServerSync] = useState(JSON.stringify(initialFilters));
  useEffect(() => {
    const ser = JSON.stringify(filters);
    if (ser === lastServerSync) return;
    const handle = setTimeout(() => {
      setLastServerSync(ser);
      void updateUserFilters(filters);
    }, 600);
    return () => clearTimeout(handle);
  }, [filters, lastServerSync]);

  // ── Theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    applyTheme(initialTheme);
    if (initialTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [initialTheme]);

  // ── Tasks state — re-sync when server prop changes ───────────────────
  const [tasks, setTasks] = useState(initialTasks);
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  if (prevInitialTasks !== initialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
  }

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    initialTags.forEach((t) => m.set(t.id, t));
    return m;
  }, [initialTags]);

  // ── Collapse state — persisted per-browser ──────────────────────────
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsedIds]));
    } catch {
      /* private mode / quota — ignore */
    }
  }, [collapsedIds]);
  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Render-ready task tree per quadrant ──────────────────────────────
  const filteredByQuadrant = useMemo(() => {
    const matchSet = new Set<string>();
    for (const id of filters.selectedTagIds) {
      descendantTagIds(id, initialTags).forEach((d) => matchSet.add(d));
    }

    const passes = (t: TaskWithTagIds) => {
      if (!filters.showCompleted && t.completed) return false;
      if (!passesDeadlineFilter(t.deadline, filters.deadlineFilter)) return false;
      if (filters.selectedTagIds.length === 0) return true;
      return t.tagIds.some((id) => matchSet.has(id));
    };

    const childrenByParent = new Map<string, TaskWithTagIds[]>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      const list = childrenByParent.get(t.parentId);
      if (list) list.push(t);
      else childrenByParent.set(t.parentId, [t]);
    }
    for (const list of childrenByParent.values()) {
      list.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }

    const map: Record<Quadrant, RenderedTask[]> = { 1: [], 2: [], 3: [], 4: [] };

    const append = (
      task: TaskWithTagIds,
      depth: number,
      into: RenderedTask[],
    ) => {
      const children = childrenByParent.get(task.id) ?? [];
      const isCollapsed = collapsedIds.has(task.id);
      into.push({
        ...task,
        depth,
        hasChildren: children.length > 0,
        isCollapsed,
      });
      if (isCollapsed) return;
      for (const child of children) append(child, depth + 1, into);
    };

    const topLevel = tasks
      .filter((t) => !t.parentId && passes(t))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    for (const t of topLevel) append(t, 0, map[t.quadrant as Quadrant]);
    return map;
  }, [tasks, filters, initialTags, collapsedIds]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of initialTags) {
      const desc = descendantTagIds(tag.id, initialTags);
      let c = 0;
      for (const t of tasks) {
        if (t.tagIds.some((id) => desc.has(id))) c++;
      }
      counts.set(tag.id, c);
    }
    return counts;
  }, [initialTags, tasks]);

  // ── DnD ──────────────────────────────────────────────────────────────
  // Split sensors so touch and mouse don't fight each other. The previous
  // PointerSensor activated on 5px of movement *regardless of input type*,
  // which meant a swipe-to-scroll on touch devices triggered a drag before
  // the TouchSensor's long-press timer ever ran. MouseSensor only listens
  // to mouse events; TouchSensor only to touch events; no overlap.
  //
  // 250ms delay + 8px tolerance on touch is the "long-press to drag"
  // threshold: any swipe finger-motion within those 250ms cancels the
  // drag and returns control to the browser's native scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask =
    activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  // Active descendants are needed for cycle prevention when dropping
  // ON another card. We only need to know this *during* a drag — not
  // every render — so cache it in a ref at drag start. (Was previously
  // a useMemo over [activeId, tasks], which recomputed on every state
  // tick.)
  const activeDescendantsRef = useRef<Set<string>>(new Set());

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    // Mobile quadrant tab drop targets take priority — drop on a tab
    // moves the task to that quadrant.
    const tabHit = pointerCollisions.find((c) =>
      String(c.id).startsWith("q-tab-"),
    );
    if (tabHit) return [tabHit];
    const nestHit = pointerCollisions.find((c) => {
      const cid = String(c.id);
      if (!cid.startsWith("nest-")) return false;
      const taskId = cid.slice(5);
      if (taskId === activeId) return false;
      if (activeDescendantsRef.current.has(taskId)) return false;
      return true;
    });
    if (nestHit) return [nestHit];
    return closestCenter(args);
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);

    // Compute descendants once at drag start.
    const childrenByParent = new Map<string, string[]>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      const list = childrenByParent.get(t.parentId);
      if (list) list.push(t.id);
      else childrenByParent.set(t.parentId, [t.id]);
    }
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of childrenByParent.get(cur) ?? []) {
        if (!out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      }
    }
    activeDescendantsRef.current = out;
  };

  /**
   * On drop, do everything optimistically + locally first. Server fires
   * in the background. Don't `router.refresh()` on success — local
   * state already matches what the server's about to write. Only
   * refresh on error to roll back.
   */
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    activeDescendantsRef.current = new Set();
    if (!over || active.id === over.id) return;

    const overId = String(over.id);
    const taskId = String(active.id);
    const activeTaskNow = tasks.find((t) => t.id === taskId);
    if (!activeTaskNow) return;

    // ── Determine target group + insertion position ───────────────────
    let newParentId: string | null;
    let newQuadrant: Quadrant;
    let insertAtFrontOfNestTarget = false;

    if (overId.startsWith("nest-")) {
      // Nest: become last child of target.
      newParentId = overId.slice(5);
      const target = tasks.find((t) => t.id === newParentId);
      if (!target) return;
      newQuadrant = target.quadrant as Quadrant;
    } else if (overId.startsWith("quadrant-")) {
      // Empty quadrant body: become last top-level in that quadrant.
      newParentId = null;
      newQuadrant = Number(overId.slice("quadrant-".length)) as Quadrant;
      insertAtFrontOfNestTarget = false; // append; same effect as first branch
    } else if (overId.startsWith("q-tab-")) {
      // Drop on a mobile quadrant tab: move to that quadrant, top-level,
      // append at end. Also switch the visible quadrant so the user sees
      // their task land somewhere immediately.
      newParentId = null;
      newQuadrant = Number(overId.slice("q-tab-".length)) as Quadrant;
      setActiveQuadrant(newQuadrant);
    } else {
      // Drop on (or near) a specific task: become its sibling.
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      newParentId = overTask.parentId;
      newQuadrant = overTask.quadrant as Quadrant;
    }

    // Build the new sibling group order.
    const currentSiblings = tasks
      .filter(
        (t) =>
          t.parentId === newParentId &&
          t.quadrant === newQuadrant &&
          t.id !== taskId,
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((t) => t.id);

    let newSiblingsOrder: string[];
    if (
      overId.startsWith("nest-") ||
      overId.startsWith("quadrant-") ||
      overId.startsWith("q-tab-")
    ) {
      // Append at end (or front, if we wanted "newest first" for nest).
      newSiblingsOrder = insertAtFrontOfNestTarget
        ? [taskId, ...currentSiblings]
        : [...currentSiblings, taskId];
    } else {
      // Drop near a specific task: insert active at that task's index.
      const overIdx = currentSiblings.indexOf(overId);
      if (overIdx === -1) {
        newSiblingsOrder = [...currentSiblings, taskId];
      } else {
        newSiblingsOrder = [
          ...currentSiblings.slice(0, overIdx),
          taskId,
          ...currentSiblings.slice(overIdx),
        ];
      }
    }

    // ── Optimistic local update ───────────────────────────────────────
    // 1. Move active + cascade quadrant to its descendants
    // 2. Rewrite sortOrder for the destination sibling group
    const descendants = collectDescendantsLocal(taskId, tasks);
    const positionInGroup = new Map(newSiblingsOrder.map((id, i) => [id, i]));

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            parentId: newParentId,
            quadrant: newQuadrant,
            sortOrder: positionInGroup.get(t.id) ?? t.sortOrder,
          };
        }
        if (descendants.has(t.id) && t.quadrant !== newQuadrant) {
          return { ...t, quadrant: newQuadrant };
        }
        const newPos = positionInGroup.get(t.id);
        if (
          newPos !== undefined &&
          t.parentId === newParentId &&
          t.quadrant === newQuadrant
        ) {
          return { ...t, sortOrder: newPos };
        }
        return t;
      }),
    );

    // ── Server fire-and-forget (refresh only on error to roll back) ──
    startTransition(async () => {
      try {
        await moveTask({
          taskId,
          newParentId,
          newQuadrant,
          newSiblingsOrder,
        });
        // No router.refresh: local state matches server.
      } catch (err) {
        console.error("moveTask failed:", err);
        // Reset to server state on error.
        router.refresh();
      }
    });
  };

  // ── Tag manager / edit modal / inline add ────────────────────────────
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithTagIds | null>(null);
  const [adding, setAdding] = useState<Quadrant | null>(null);

  // ── Mobile single-quadrant view ──────────────────────────────────────
  // Mobile shows one quadrant at a time (full-height, scrollable) with
  // a tab bar to switch. Desktop renders the standard 2×2 grid.
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant>(1);
  const submitTask = (q: Quadrant) =>
    (input: {
      title: string;
      notes: string;
      tagIds: string[];
      deadline: string | null;
    }) => {
      startTransition(async () => {
        await createTask({ ...input, quadrant: q });
        setAdding(null);
        router.refresh();
      });
    };

  // ── Undo ─────────────────────────────────────────────────────────────
  const [pendingUndo, setPendingUndo] = useState<UndoAction | null>(null);
  const handleDelete = (id: string) =>
    startTransition(async () => {
      try {
        const result = await deleteTask(id);
        const ids = result?.deletedIds ?? [];
        setPendingUndo({
          description:
            ids.length === 1
              ? "Task deleted"
              : `Task + ${ids.length - 1} subtask${ids.length === 2 ? "" : "s"} deleted`,
          run: async () => {
            await restoreTasks(ids);
            router.refresh();
          },
        });
        router.refresh();
      } catch (err) {
        console.error("deleteTask failed:", err);
      }
    });

  return (
    <div className="bg-background flex h-screen flex-col">
      <Header
        userEmail={userEmail}
        theme={initialTheme}
        onOpenTags={() => setTagsOpen(true)}
      />

      <div className="bg-surface border-border flex-shrink-0 border-b px-4 py-2">
        <FilterStrip
          tags={initialTags}
          filters={filters}
          onChange={setFilters}
          taskCounts={tagCounts}
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/* Mobile-only quadrant tab bar. Each tab is also a drop target,
            so cross-quadrant drag works on mobile (drop on a tab to move
            the task there). Hidden on tablet/desktop (md+) where the
            full 2×2 grid is shown. */}
        <div className="bg-surface border-border flex flex-shrink-0 gap-1 border-b px-2 py-1.5 md:hidden">
          {([1, 2, 3, 4] as Quadrant[]).map((q) => (
            <MobileQuadrantTab
              key={q}
              quadrant={q}
              isActive={q === activeQuadrant}
              count={filteredByQuadrant[q].filter((t) => t.depth === 0).length}
              onClick={() => setActiveQuadrant(q)}
            />
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2 md:grid-cols-2 md:grid-rows-2">
          {([1, 2, 3, 4] as Quadrant[]).map((q) => (
            <div
              key={q}
              className={cn(
                "flex min-h-0 flex-col",
                // Hide non-active quadrants on mobile (single-quadrant view).
                // On md+, all four show in the grid.
                q !== activeQuadrant && "max-md:hidden",
              )}
            >
              <QuadrantPanel
                quadrant={q}
                tasks={filteredByQuadrant[q]}
                tags={initialTags}
                tagsById={tagsById}
                pending={pending}
                adding={adding === q}
                onStartAdd={() => setAdding(q)}
                onCancelAdd={() => setAdding(null)}
                onSubmitTask={submitTask(q)}
                onToggleTask={(id) =>
                  startTransition(async () => {
                    await toggleTaskCompleted(id);
                    router.refresh();
                  })
                }
                onDeleteTask={handleDelete}
                onEditTask={(t) => setEditingTask(t)}
                onToggleCollapsed={toggleCollapsed}
              />
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <TaskCard
              task={activeTask}
              tagsById={tagsById}
              disabled
              onToggle={() => {}}
              onDelete={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      <TagManagerModal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        tags={initialTags}
      />

      <EditTaskModal
        open={editingTask !== null}
        task={editingTask}
        tags={initialTags}
        onClose={() => setEditingTask(null)}
      />

      {pendingUndo && (
        <UndoToast
          action={pendingUndo}
          onDismiss={() => setPendingUndo(null)}
          onUndo={() => {
            const action = pendingUndo;
            setPendingUndo(null);
            startTransition(async () => {
              try {
                await action.run();
              } catch (err) {
                console.error("undo failed:", err);
              }
            });
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function collectDescendantsLocal(
  rootId: string,
  tasks: TaskWithTagIds[],
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = childrenByParent.get(t.parentId);
    if (list) list.push(t.id);
    else childrenByParent.set(t.parentId, [t.id]);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenByParent.get(id) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

/**
 * Mobile-only tab in the quadrant switcher row. Doubles as a DnD drop
 * target — dropping a task onto a tab moves the task to that quadrant
 * (top-level, appended at end). The active tab gets a colored top
 * border in the quadrant accent color.
 */
function MobileQuadrantTab({
  quadrant,
  isActive,
  count,
  onClick,
}: {
  quadrant: Quadrant;
  isActive: boolean;
  count: number;
  onClick: () => void;
}) {
  const meta = QUADRANTS[quadrant];
  const accent = QUADRANT_ACCENT[quadrant];
  // Destructure right at the call site so React 19's lint doesn't treat
  // the whole returned object as a ref-like value (it contains setNodeRef).
  const { setNodeRef, isOver } = useDroppable({
    id: `q-tab-${quadrant}`,
    data: { type: "quadrant-tab", quadrant },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 transition-colors",
        isActive ? "bg-muted" : "hover:bg-muted",
        isOver && "ring-2 ring-[var(--accent)]",
      )}
      style={{
        borderTop: `3px solid ${isActive ? accent : "transparent"}`,
      }}
    >
      <span
        className="text-[12.5px] font-bold leading-none"
        style={{ color: accent }}
      >
        {meta.roman}
      </span>
      <span className="text-muted-foreground text-[10px] leading-none">
        {count}
      </span>
    </button>
  );
}

function UndoToast({
  action,
  onUndo,
  onDismiss,
}: {
  action: UndoAction;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, 6000);
    return () => clearTimeout(handle);
  }, [action, onDismiss]);

  return (
    <div
      role="status"
      className="bg-foreground text-background fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 shadow-md"
    >
      <span className="text-sm">{action.description}</span>
      <button
        type="button"
        onClick={onUndo}
        className="text-accent inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        <Undo2 size={13} />
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-background/70 hover:text-background"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
