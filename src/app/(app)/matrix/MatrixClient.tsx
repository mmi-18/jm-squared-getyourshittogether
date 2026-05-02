"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
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
  reorderTasks,
  toggleTaskCompleted,
} from "../_actions/tasks";
import { updateUserFilters } from "../_actions/settings";
import { QuadrantPanel } from "@/components/matrix/QuadrantPanel";
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

  // ── Filter state — local + debounced server sync ──────────────────────
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const lastServerSync = useRef(JSON.stringify(initialFilters));
  useEffect(() => {
    const ser = JSON.stringify(filters);
    if (ser === lastServerSync.current) return;
    const handle = setTimeout(() => {
      lastServerSync.current = ser;
      void updateUserFilters(filters);
    }, 600);
    return () => clearTimeout(handle);
  }, [filters]);

  // ── Theme: apply on mount, react to system pref changes if theme=system ─
  useEffect(() => {
    applyTheme(initialTheme);
    if (initialTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [initialTheme]);

  // ── Tasks state — optimistic copy of server-rendered initialTasks ─────
  // We keep a local mirror so DnD can update positions instantly; server
  // actions write through, and revalidatePath() then passes a new
  // initialTasks reference. We re-sync via the React 19 "adjust state
  // when a prop changes" pattern (compare prev prop tracked in another
  // useState, conditionally call setState during render — cheaper than
  // an effect, lint-clean since refs aren't involved).
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

  // ── Filtered, grouped-by-quadrant view ────────────────────────────────
  const filteredByQuadrant = useMemo(() => {
    // Pre-compute the descendant ID set for each *selected* tag so a parent
    // tag filter matches tasks tagged with any descendant.
    const matchSet = new Set<string>();
    for (const id of filters.selectedTagIds) {
      const desc = descendantTagIds(id, initialTags);
      desc.forEach((d) => matchSet.add(d));
    }

    const passes = (t: TaskWithTagIds) => {
      if (t.parentId) return false; // top-level only for now
      if (!filters.showCompleted && t.completed) return false;
      if (!passesDeadlineFilter(t.deadline, filters.deadlineFilter)) return false;
      if (filters.selectedTagIds.length === 0) return true;
      return t.tagIds.some((id) => matchSet.has(id));
    };

    const map: Record<Quadrant, TaskWithTagIds[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const t of tasks) if (passes(t)) map[t.quadrant as Quadrant].push(t);
    // Already ordered by sortOrder from the server query.
    return map;
  }, [tasks, filters, initialTags]);

  // Counts for the filter chips — count tasks (top-level only) that
  // include each tag *or any of its descendants*.
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of initialTags) {
      const desc = descendantTagIds(tag.id, initialTags);
      let c = 0;
      for (const t of tasks) {
        if (t.parentId) continue;
        if (t.tagIds.some((id) => desc.has(id))) c++;
      }
      counts.set(tag.id, c);
    }
    return counts;
  }, [initialTags, tasks]);

  // ── DnD setup ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    // PointerSensor handles mouse + pen. activationConstraint.distance
    // means a 5px drag is required before drag starts — prevents
    // click-as-drag on accidental single-click.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // TouchSensor on mobile. delay+tolerance prevents scroll/drag conflicts:
    // hold for 200ms to start a drag, but if the finger moves <5px in
    // that time it's still treated as a tap.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask =
    activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  /**
   * As the user drags across containers, mirror the move locally so the
   * source quadrant doesn't leave a gap and the dest quadrant shows the
   * card live. Server write happens once, on drag end.
   */
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "task"; quadrant: Quadrant; parentId: string | null }
      | undefined;
    const overData = over.data.current as
      | { type: "task" | "quadrant"; quadrant: Quadrant }
      | undefined;
    if (!activeData || !overData) return;

    const sourceQ = activeData.quadrant;
    const targetQ = overData.quadrant;
    if (sourceQ === targetQ) return;

    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === active.id);
      if (idx === -1) return prev;
      const moved = { ...prev[idx], quadrant: targetQ as Quadrant };
      const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      // Insert at the position of the over task within target, or at the end.
      if (overData.type === "task") {
        const overIdx = without.findIndex((t) => t.id === over.id);
        if (overIdx === -1) return [...without, moved];
        return [
          ...without.slice(0, overIdx),
          moved,
          ...without.slice(overIdx),
        ];
      }
      return [...without, moved];
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    // Compute the post-drag, top-level (parentId=null), per-quadrant order
    // from our local state and ship it to the server. We do one
    // reorderTasks per affected quadrant. It's also fine to send the
    // unaffected quadrants — the server happily no-ops.
    const activeData = active.data.current as
      | { type: "task"; quadrant: Quadrant; parentId: string | null }
      | undefined;
    if (!activeData) return;

    // Local same-quadrant reorder via arrayMove (so the optimistic state
    // matches what we'll write).
    if (active.id !== over.id) {
      const overData = over.data.current as
        | { type: "task" | "quadrant"; quadrant: Quadrant }
        | undefined;
      const targetQ = overData?.quadrant ?? activeData.quadrant;

      setTasks((prev) => {
        const inSameQ =
          prev.findIndex((t) => t.id === active.id && t.quadrant === targetQ) !== -1 &&
          prev.findIndex((t) => t.id === over.id && t.quadrant === targetQ) !== -1;
        if (!inSameQ) return prev; // already moved by onDragOver
        const aIdx = prev.findIndex((t) => t.id === active.id);
        const oIdx = prev.findIndex((t) => t.id === over.id);
        if (aIdx === -1 || oIdx === -1) return prev;
        return arrayMove(prev, aIdx, oIdx);
      });
    }

    // Defer to the next microtask so the setTasks above commits before we read.
    queueMicrotask(() => {
      const after = tasksByQuadrantTopLevel();
      // Only ship quadrants that actually contain the dragged task (source
      // and dest). We'll detect them by scanning current state for the
      // active id and the previous source — easier: just send all four.
      startTransition(async () => {
        for (const q of [1, 2, 3, 4] as Quadrant[]) {
          const ids = after[q].map((t) => t.id);
          if (ids.length === 0) continue;
          await reorderTasks({
            quadrant: q,
            parentId: null,
            orderedIds: ids,
          });
        }
        router.refresh();
      });
    });
  };

  /** Helper: read the current top-level grouping. */
  const tasksByQuadrantTopLevel = (): Record<Quadrant, TaskWithTagIds[]> => {
    const map: Record<Quadrant, TaskWithTagIds[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const t of tasks) if (!t.parentId) map[t.quadrant as Quadrant].push(t);
    return map;
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
        collisionDetection={closestCenter}
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
