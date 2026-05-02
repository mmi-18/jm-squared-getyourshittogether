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
  toggleTaskCompleted,
} from "../_actions/tasks";
import { updateUserFilters } from "../_actions/settings";
import { QuadrantPanel, type RenderedTask } from "@/components/matrix/QuadrantPanel";
import { Header, applyTheme } from "@/components/matrix/Header";
import { FilterStrip } from "@/components/matrix/FilterStrip";
import { TagManagerModal } from "@/components/matrix/TagManagerModal";
import { TaskCard, type TaskWithTagIds } from "@/components/matrix/TaskCard";
import { EditTaskModal } from "@/components/matrix/EditTaskModal";

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

  // ── Filter state — local + debounced server sync ─────────────────────
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

  // ── Theme ─────────────────────────────────────────────────────────────
  useEffect(() => {
    applyTheme(initialTheme);
    if (initialTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [initialTheme]);

  // ── Tasks state — optimistic mirror of server-rendered initialTasks ──
  // Re-sync when the server prop changes (after revalidatePath()) using
  // the React 19 "adjust state when a prop changes" pattern.
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

  // ── Build the depth-annotated, ordered task list per quadrant ────────
  // Filter applies to top-level tasks; their entire subtree comes along
  // for the ride (showing subtasks of a hidden parent would be confusing).
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

    // Index children by parent for the recursive build.
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
      into.push({ ...task, depth });
      for (const child of childrenByParent.get(task.id) ?? []) {
        append(child, depth + 1, into);
      }
    };

    // Top-level passing tasks bring their subtrees with them.
    const topLevel = tasks
      .filter((t) => !t.parentId && passes(t))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    for (const t of topLevel) append(t, 0, map[t.quadrant as Quadrant]);
    return map;
  }, [tasks, filters, initialTags]);

  // Counts per tag — counts tasks (top-level + subtasks) tagged with the
  // tag *or any of its descendants*.
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

  // Pre-compute the active task's descendants (cycle-prevention for
  // drag-to-nest). Recomputed when tasks change; cheap.
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

  /**
   * Custom collision detector: pointer-within wins for nest droppables
   * (so dropping ON a card nests under it). Self + descendants are
   * skipped to prevent cycles. Falls back to closestCenter for the
   * sortable / quadrant droppables (gap-based reorder + cross-quadrant).
   */
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

  /**
   * As the user drags across containers, mirror the move locally so the
   * source quadrant doesn't leave a gap. Only relevant for top-level
   * tasks (depth=0) since subtasks are non-draggable.
   */
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
    if (overData.type === "nest") return; // hovering for nest, no reorder mirror

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

    // ── NEST: dropped on another card's nest droppable ────────────────
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

    // ── REORDER + cross-quadrant move ─────────────────────────────────
    const activeData = active.data.current as
      | { type: "task"; quadrant: Quadrant; parentId: string | null }
      | undefined;
    if (!activeData) return;

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

  // ── Tag manager modal ─────────────────────────────────────────────────
  const [tagsOpen, setTagsOpen] = useState(false);

  // ── Edit task modal ───────────────────────────────────────────────────
  const [editingTask, setEditingTask] = useState<TaskWithTagIds | null>(null);

  // ── Inline-add state, scoped per quadrant ─────────────────────────────
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
              onDeleteTask={(id) =>
                startTransition(async () => {
                  await deleteTask(id);
                  router.refresh();
                })
              }
              onEditTask={(t) => setEditingTask(t)}
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
    </div>
  );
}
