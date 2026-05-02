"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Undo2, X as XIcon } from "lucide-react";
import type { Tag } from "@prisma/client";
import { Theme } from "@prisma/client";
import { type FilterState, type Quadrant } from "@/lib/types";
import { descendantTagIds } from "@/lib/tag-utils";
import { passesDeadlineFilter } from "@/lib/quadrant-utils";
import {
  createTask,
  deleteTask,
  nestTask,
  reorderTasks,
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

type UndoAction = {
  description: string;
  run: () => Promise<void>;
};

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

  // ── Collapse state — fold/unfold subtasks per task, persisted to LS ──
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
      /* quota / private mode — ignore */
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

  // ── Build the depth-annotated, ordered task list per quadrant ────────
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
      if (isCollapsed) return; // skip rendering descendants when collapsed
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

  // ── DnD sensors ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask =
    activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const activeDescendants = useMemo(() => {
    if (!activeId) return new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      const list = childrenByParent.get(t.parentId);
      if (list) list.push(t.id);
      else childrenByParent.set(t.parentId, [t.id]);
    }
    const out = new Set<string>();
    const stack = [activeId];
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
  }, [activeId, tasks]);

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const nestHit = pointerCollisions.find((c) => {
      const cid = String(c.id);
      if (!cid.startsWith("nest-")) return false;
      const taskId = cid.slice(5);
      if (taskId === activeId) return false;
      if (activeDescendants.has(taskId)) return false;
      return true;
    });
    if (nestHit) return [nestHit];
    return closestCenter(args);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "task"; quadrant: Quadrant; parentId: string | null }
      | undefined;
    const overData = over.data.current as
      | { type: "task" | "quadrant" | "nest"; quadrant?: Quadrant }
      | undefined;
    if (!activeData || !overData) return;
    if (overData.type === "nest") return;
    if (activeData.parentId !== null) return; // mirror only top-level cross-quadrant

    const sourceQ = activeData.quadrant;
    const targetQ = overData.quadrant;
    if (!targetQ || sourceQ === targetQ) return;

    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === active.id);
      if (idx === -1) return prev;
      const moved = { ...prev[idx], quadrant: targetQ as Quadrant };
      const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      if (overData.type === "task") {
        const overIdx = without.findIndex((t) => t.id === over.id);
        if (overIdx === -1) return [...without, moved];
        return [...without.slice(0, overIdx), moved, ...without.slice(overIdx)];
      }
      return [...without, moved];
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const overId = String(over.id);
    const activeData = active.data.current as
      | { type: "task"; quadrant: Quadrant; parentId: string | null }
      | undefined;
    if (!activeData) return;

    // ── NEST: drop on another card's nest droppable ───────────────────
    if (overId.startsWith("nest-")) {
      const targetId = overId.slice(5);
      startTransition(async () => {
        try {
          await nestTask({ childId: String(active.id), newParentId: targetId });
          router.refresh();
        } catch (err) {
          console.error("nestTask failed:", err);
          router.refresh();
        }
      });
      return;
    }

    const isSubtask = activeData.parentId !== null;

    // ── SUBTASK drag: reparent based on what we dropped near ──────────
    // Position-wise: the moved subtask lands at the END of its new
    // sibling group. Fine-grained reorder of subtasks is uncommon
    // enough that we trade it for simpler logic.
    if (isSubtask) {
      let newParentId: string | null = null;
      let newQuadrant: Quadrant | undefined;

      if (overId.startsWith("quadrant-")) {
        newQuadrant = Number(overId.slice("quadrant-".length)) as Quadrant;
        newParentId = null;
      } else {
        const overTask = tasks.find((t) => t.id === overId);
        if (!overTask) return;
        // Become a sibling of the over task: same parentId, same quadrant.
        newParentId = overTask.parentId;
        newQuadrant = overTask.quadrant as Quadrant;
      }

      startTransition(async () => {
        try {
          await nestTask({
            childId: String(active.id),
            newParentId,
            newQuadrant,
          });
          router.refresh();
        } catch (err) {
          console.error("nestTask (subtask drag) failed:", err);
          router.refresh();
        }
      });
      return;
    }

    // ── TOP-LEVEL reorder + cross-quadrant move ───────────────────────
    if (active.id !== over.id) {
      const overData = over.data.current as
        | { type: "task" | "quadrant"; quadrant: Quadrant }
        | undefined;
      const targetQ = overData?.quadrant ?? activeData.quadrant;

      setTasks((prev) => {
        const inSameQ =
          prev.findIndex((t) => t.id === active.id && t.quadrant === targetQ) !== -1 &&
          prev.findIndex((t) => t.id === over.id && t.quadrant === targetQ) !== -1;
        if (!inSameQ) return prev;
        const aIdx = prev.findIndex((t) => t.id === active.id);
        const oIdx = prev.findIndex((t) => t.id === over.id);
        if (aIdx === -1 || oIdx === -1) return prev;
        return arrayMove(prev, aIdx, oIdx);
      });
    }

    queueMicrotask(() => {
      const after: Record<Quadrant, TaskWithTagIds[]> = { 1: [], 2: [], 3: [], 4: [] };
      for (const t of tasks) if (!t.parentId) after[t.quadrant as Quadrant].push(t);
      startTransition(async () => {
        for (const q of [1, 2, 3, 4] as Quadrant[]) {
          const ids = after[q].map((t) => t.id);
          if (ids.length === 0) continue;
          await reorderTasks({ quadrant: q, parentId: null, orderedIds: ids });
        }
        router.refresh();
      });
    });
  };

  // ── Tag manager / edit modal ──────────────────────────────────────────
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithTagIds | null>(null);

  // ── Add task ──────────────────────────────────────────────────────────
  const [adding, setAdding] = useState<Quadrant | null>(null);
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

  // ── Undo: capture last destructive action so a toast can revert it ───
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
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-4 gap-2 p-2 md:grid-cols-2 md:grid-rows-2">
          {([1, 2, 3, 4] as Quadrant[]).map((q) => (
            <QuadrantPanel
              key={q}
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
          ))}
        </div>

        <DragOverlay>
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

/**
 * Toast that appears at the bottom of the screen after a destructive
 * action, offering an Undo for ~6 seconds. Click Undo to revert; click
 * the X to dismiss without undoing. Auto-dismisses on timeout.
 */
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
    // Restart the timer when a new action arrives.
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
