"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
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
  toggleTaskWontDo,
  updateTask,
} from "../_actions/tasks";
import { updateUserFilters } from "../_actions/settings";
import { QuadrantPanel, type RenderedTask } from "@/components/matrix/QuadrantPanel";
import { Header, applyTheme } from "@/components/matrix/Header";
import { FilterStrip } from "@/components/matrix/FilterStrip";
import { TagManagerModal } from "@/components/matrix/TagManagerModal";
import { TaskCard, type TaskWithTagIds } from "@/components/matrix/TaskCard";
import { EditTaskModal } from "@/components/matrix/EditTaskModal";
import { BottomTabs, type View } from "@/components/matrix/BottomTabs";
import { ListView } from "@/components/matrix/ListView";
import { UpcomingRangePicker } from "@/components/matrix/UpcomingRangePicker";

// localStorage key tracks which parent tasks have been EXPANDED (default
// is "everything folded"). Renamed from the earlier "collapsed" key
// since the semantics flipped — old data is intentionally ignored.
const EXPANDED_STORAGE_KEY = "gyst-expanded-tasks";
const VIEW_STORAGE_KEY = "gyst-view";
const UPCOMING_RANGE_STORAGE_KEY = "gyst-upcoming-range";

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

  // ── Expand state — default folded, persisted per-browser ─────────────
  // Inverted from the previous "collapsed" semantics: the set tracks
  // tasks the user has *explicitly expanded*. Anything not in the set
  // (including freshly visible / freshly created parents) renders folded.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expandedIds]));
    } catch {
      /* private mode / quota — ignore */
    }
  }, [expandedIds]);
  const toggleCollapsed = (id: string) => {
    // The chevron callback inverts: expanded → folded, folded → expanded.
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // All parent task ids (tasks with at least one subtask). Recomputed
  // when tasks change. Used for "Expand all" + the hasAnyExpanded
  // hint shown to Header so the action label flips correctly.
  const allParentIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.parentId) set.add(t.parentId);
    return set;
  }, [tasks]);
  const expandAll = () => setExpandedIds(new Set(allParentIds));
  const collapseAll = () => setExpandedIds(new Set());

  // ── Top-level view: matrix / today / upcoming ────────────────────────
  // (Declared early so the list-view useMemo below can read it.)
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "matrix";
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "matrix" || v === "today" || v === "upcoming") return v;
    return "matrix";
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* private mode — ignore */
    }
  }, [view]);

  // Upcoming view's date range, persisted per-browser. Defaults to
  // (today, today+7) so a user landing on Upcoming for the first time
  // sees a useful week-ahead view without having to configure anything.
  const [upcomingRange, setUpcomingRange] = useState<{ from: string; to: string }>(
    () => {
      const today = isoOffset(0);
      const week = isoOffset(7);
      if (typeof window === "undefined") return { from: today, to: week };
      try {
        const raw = localStorage.getItem(UPCOMING_RANGE_STORAGE_KEY);
        if (!raw) return { from: today, to: week };
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.from === "string" && typeof parsed.to === "string") {
          return parsed;
        }
      } catch {
        /* ignore */
      }
      return { from: today, to: week };
    },
  );
  useEffect(() => {
    try {
      localStorage.setItem(UPCOMING_RANGE_STORAGE_KEY, JSON.stringify(upcomingRange));
    } catch {
      /* ignore */
    }
  }, [upcomingRange]);

  // ── Render-ready task tree per quadrant ──────────────────────────────
  const filteredByQuadrant = useMemo(() => {
    const matchSet = new Set<string>();
    for (const id of filters.selectedTagIds) {
      descendantTagIds(id, initialTags).forEach((d) => matchSet.add(d));
    }

    const passes = (t: TaskWithTagIds) => {
      // Both completed AND won't-do are treated as "off-active" by the
      // show-completed filter — they're different categories of "done".
      if (!filters.showCompleted && (t.completed || t.wontDo)) return false;
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
      // "Expanded" iff explicitly in the set; default folded.
      const isCollapsed = !expandedIds.has(task.id);
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
  }, [tasks, filters, initialTags, expandedIds]);

  // ── Today / Upcoming list-view tasks ─────────────────────────────────
  // Sorted by (quadrant, deadline, sortOrder). Includes both top-level
  // tasks and subtasks; subtasks render flat with a `↗ parent title`
  // context link in their row. Today includes overdue (so they don't
  // perpetually disappear); Upcoming respects the user's chosen range.
  const listViewTasks = useMemo(() => {
    if (view === "matrix") return [] as TaskWithTagIds[];

    const matchSet = new Set<string>();
    for (const id of filters.selectedTagIds) {
      descendantTagIds(id, initialTags).forEach((d) => matchSet.add(d));
    }
    const today = isoOffset(0);
    const lo =
      upcomingRange.from < upcomingRange.to
        ? upcomingRange.from
        : upcomingRange.to;
    const hi =
      upcomingRange.from < upcomingRange.to
        ? upcomingRange.to
        : upcomingRange.from;

    const passes = (t: TaskWithTagIds) => {
      if (!filters.showCompleted && (t.completed || t.wontDo)) return false;
      if (!t.deadline) return false;
      const dl = formatIsoDate(
        t.deadline instanceof Date ? t.deadline : new Date(t.deadline),
      );
      if (view === "today") {
        // Include today + overdue so action items don't disappear.
        if (dl > today) return false;
      } else if (view === "upcoming") {
        if (dl < lo || dl > hi) return false;
      }
      if (filters.selectedTagIds.length === 0) return true;
      return t.tagIds.some((id) => matchSet.has(id));
    };

    return tasks
      .filter(passes)
      .sort((a, b) => {
        if (a.quadrant !== b.quadrant) return a.quadrant - b.quadrant;
        const adl = a.deadline
          ? formatIsoDate(
              a.deadline instanceof Date ? a.deadline : new Date(a.deadline),
            )
          : "";
        const bdl = b.deadline
          ? formatIsoDate(
              b.deadline instanceof Date ? b.deadline : new Date(b.deadline),
            )
          : "";
        if (adl !== bdl) return adl.localeCompare(bdl);
        return a.sortOrder - b.sortOrder;
      });
  }, [view, tasks, filters, initialTags, upcomingRange]);

  // For "↗ parent title" context links on subtasks in list view.
  const parentTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);

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

  /**
   * Collision detection with explicit priority order:
   *
   *   1. Mobile quadrant tabs (drag-onto-tab cross-quadrant move)
   *   2. Task cards the cursor is INSIDE (via pointerWithin)
   *   3. Anything else nearest by center (closestCenter for empty
   *      quadrant body / between-card gaps)
   *
   * Step 2 is the critical one. The quadrant body's `useDroppable`
   * envelops every task card's rect — with plain closestCenter, when
   * the cursor sits near the geometric center of a populated list, the
   * quadrant body's center is sometimes closer than any individual
   * task's center. The quadrant wins, the card under the cursor never
   * gets the over state, and drops land as top-level appends instead
   * of reordering. pointer-within on cards bypasses that entirely.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);

    const tabHit = pointerCollisions.find((c) =>
      String(c.id).startsWith("q-tab-"),
    );
    if (tabHit) return [tabHit];

    const cardHit = pointerCollisions.find((c) => {
      const id = String(c.id);
      return !id.startsWith("quadrant-") && !id.startsWith("q-tab-");
    });
    if (cardHit) return [cardHit];

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

    // Determine the destination based on which zone droppable is `over`.
    // Zone ids: "before-X" / "nest-X" / "after-X" / "quadrant-N" / "q-tab-N".
    let zoneRefTask: TaskWithTagIds | null = null;
    let zonePosition: "before" | "nest" | "after" | null = null;

    if (overId.startsWith("nest-")) {
      const targetId = overId.slice("nest-".length);
      zoneRefTask = tasks.find((t) => t.id === targetId) ?? null;
      if (!zoneRefTask) return;
      zonePosition = "nest";
      newParentId = targetId;
      newQuadrant = zoneRefTask.quadrant as Quadrant;
    } else if (overId.startsWith("before-") || overId.startsWith("after-")) {
      const isBefore = overId.startsWith("before-");
      const targetId = overId.slice(isBefore ? "before-".length : "after-".length);
      zoneRefTask = tasks.find((t) => t.id === targetId) ?? null;
      if (!zoneRefTask) return;
      zonePosition = isBefore ? "before" : "after";
      newParentId = zoneRefTask.parentId;
      newQuadrant = zoneRefTask.quadrant as Quadrant;
    } else if (overId.startsWith("quadrant-")) {
      newParentId = null;
      newQuadrant = Number(overId.slice("quadrant-".length)) as Quadrant;
      insertAtFrontOfNestTarget = false;
    } else if (overId.startsWith("q-tab-")) {
      newParentId = null;
      newQuadrant = Number(overId.slice("q-tab-".length)) as Quadrant;
      setActiveQuadrant(newQuadrant);
    } else {
      return;
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
    if (zonePosition === "nest") {
      // Nest: append to end of target's children list.
      newSiblingsOrder = insertAtFrontOfNestTarget
        ? [taskId, ...currentSiblings]
        : [...currentSiblings, taskId];
    } else if (zonePosition === "before" && zoneRefTask) {
      // Insert immediately before the reference task in its sibling group.
      const refIdx = currentSiblings.indexOf(zoneRefTask.id);
      const insertAt = refIdx === -1 ? currentSiblings.length : refIdx;
      newSiblingsOrder = [
        ...currentSiblings.slice(0, insertAt),
        taskId,
        ...currentSiblings.slice(insertAt),
      ];
    } else if (zonePosition === "after" && zoneRefTask) {
      // Insert immediately after the reference task.
      const refIdx = currentSiblings.indexOf(zoneRefTask.id);
      const insertAt = refIdx === -1 ? currentSiblings.length : refIdx + 1;
      newSiblingsOrder = [
        ...currentSiblings.slice(0, insertAt),
        taskId,
        ...currentSiblings.slice(insertAt),
      ];
    } else {
      // Quadrant body / quadrant tab — append.
      newSiblingsOrder = [...currentSiblings, taskId];
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

    // ── Server action + explicit refresh ─────────────────────────────
    // router.refresh() AFTER successful moveTask forces the client to
    // re-fetch and pick up the server's view. If the server state
    // matches the optimistic state, the prev-prop reset is a no-op
    // visually. If they diverge (because moveTask hit a server-side
    // validation error etc.), the truth wins and the user sees the
    // error toast below — better than a phantom-saved card that snaps
    // back without any explanation.
    startTransition(async () => {
      try {
        await moveTask({
          taskId,
          newParentId,
          newQuadrant,
          newSiblingsOrder,
        });
        router.refresh();
      } catch (err) {
        console.error("moveTask failed:", err);
        setDragError(
          err instanceof Error ? err.message : "Couldn't save the move",
        );
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

  // ── Inline subtask add ──────────────────────────────────────────────
  // When set, the SubtaskForm renders below this parent task in the
  // QuadrantPanel. Click "Add subtask" in a task's ⋮ menu to set; type
  // + Enter creates a subtask and the form stays open for batch entry;
  // Esc / × / click-outside closes.
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<string | null>(null);

  useEffect(() => {
    if (!addingSubtaskTo) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Don't close when clicking inside the form itself, or on a menu
      // popover (which uses portals + base-ui menu data attrs).
      if (target.closest("[data-subtask-form]")) return;
      if (target.closest("[data-base-ui-menu]")) return;
      if (target.closest("[role=\"menu\"]")) return;
      setAddingSubtaskTo(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [addingSubtaskTo]);

  // ── Action handlers wired into the task ⋮ menu ───────────────────────
  const handleSetDeadline = (id: string, deadline: string | null) =>
    startTransition(async () => {
      try {
        await updateTask({ id, deadline });
        router.refresh();
      } catch (err) {
        console.error("updateTask deadline failed:", err);
      }
    });

  const handleAddSubtask = (parentId: string) => {
    // Auto-expand the parent so the user can see the subtask they're
    // about to add (and any siblings already there).
    setExpandedIds((prev) => {
      if (prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
    // If the user clicked "Add subtask" from the Today/Upcoming list,
    // jump to the matrix view (focused on the parent's quadrant on
    // mobile) so the inline form has somewhere to render.
    const parent = tasks.find((t) => t.id === parentId);
    if (parent && view !== "matrix") {
      setView("matrix");
      setActiveQuadrant(parent.quadrant as Quadrant);
    }
    setAddingSubtaskTo(parentId);
  };

  const handleSubmitSubtask = (parentId: string, title: string) => {
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent) return;
    startTransition(async () => {
      try {
        await createTask({
          title,
          quadrant: parent.quadrant as Quadrant,
          parentId,
        });
        router.refresh();
      } catch (err) {
        console.error("createTask (subtask) failed:", err);
      }
    });
    // Form stays open — user can keep adding siblings.
  };

  const handleToggleWontDo = (id: string) =>
    startTransition(async () => {
      try {
        await toggleTaskWontDo(id);
        router.refresh();
      } catch (err) {
        console.error("toggleTaskWontDo failed:", err);
      }
    });
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

  // ── Drag error toast — surfaces moveTask failures so they don't get
  // silently swallowed (which previously presented as "drop appears to
  // land, then snaps back to original position" with no explanation).
  const [dragError, setDragError] = useState<string | null>(null);

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
        hasAnyExpanded={expandedIds.size > 0}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      <div className="bg-surface border-border flex-shrink-0 border-b px-4 py-2">
        <FilterStrip
          tags={initialTags}
          filters={filters}
          onChange={setFilters}
          taskCounts={tagCounts}
          // Today/Upcoming views OWN their time selection — hide the
          // matrix-view's deadline preset filter to avoid two competing
          // controls.
          hideDeadlineFilter={view !== "matrix"}
        />
      </div>

      {view === "upcoming" && (
        <UpcomingRangePicker
          from={upcomingRange.from}
          to={upcomingRange.to}
          onChange={setUpcomingRange}
        />
      )}

      {view === "matrix" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          // Freeze droppable rects at drag start instead of re-measuring
          // every frame. Without this, when card B shifts up to make
          // room, its measured rect shifts too — `closestCenter` then
          // sees a different "closest", flips the over to a different
          // card, B unshifts… and you get the visible jumping the user
          // reported. With BeforeDragging, the math uses each card's
          // ORIGINAL position; the visual gap-shift via CSS transform
          // still plays as feedback, but the collision result is stable.
          measuring={{
            droppable: { strategy: MeasuringStrategy.BeforeDragging },
          }}
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
                onLongHover={() => setActiveQuadrant(q)}
              />
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2 md:grid-cols-2 md:grid-rows-2">
            {([1, 2, 3, 4] as Quadrant[]).map((q) => (
              <div
                key={q}
                className={cn(
                  "flex min-h-0 flex-col",
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
                  onSetDeadline={handleSetDeadline}
                  onAddSubtask={handleAddSubtask}
                  onToggleWontDo={handleToggleWontDo}
                  addingSubtaskTo={addingSubtaskTo}
                  onSubmitSubtask={handleSubmitSubtask}
                  onCancelSubtask={() => setAddingSubtaskTo(null)}
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
      ) : (
        <ListView
          tasks={listViewTasks}
          parentTitleById={parentTitleById}
          tagsById={tagsById}
          pending={pending}
          emptyMessage={
            view === "today"
              ? "Nothing due today (or overdue). Nice."
              : "Nothing due in this range."
          }
          onToggleTask={(id) =>
            startTransition(async () => {
              await toggleTaskCompleted(id);
              router.refresh();
            })
          }
          onDeleteTask={handleDelete}
          onEditTask={(t) => setEditingTask(t)}
          onSetDeadline={handleSetDeadline}
          onAddSubtask={handleAddSubtask}
          onToggleWontDo={handleToggleWontDo}
        />
      )}

      <BottomTabs view={view} onChangeView={setView} />

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

      {dragError && (
        <ErrorToast
          message={dragError}
          onDismiss={() => setDragError(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function isoOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return formatIsoDate(d);
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  onLongHover,
}: {
  quadrant: Quadrant;
  isActive: boolean;
  count: number;
  onClick: () => void;
  /** Fired after the user hovers a dragging task over this tab for ~500ms.
   *  Used to spring-load the destination quadrant so they can keep
   *  dragging into the now-visible body instead of just dropping on the
   *  tab. iOS Finder-folder-drag UX. */
  onLongHover: () => void;
}) {
  const meta = QUADRANTS[quadrant];
  const accent = QUADRANT_ACCENT[quadrant];
  // Destructure right at the call site so React 19's lint doesn't treat
  // the whole returned object as a ref-like value (it contains setNodeRef).
  const { setNodeRef, isOver } = useDroppable({
    id: `q-tab-${quadrant}`,
    data: { type: "quadrant-tab", quadrant },
  });

  // Spring-load: if the dragged task hovers this tab for ~700ms, switch
  // the visible quadrant under the user's finger so they can keep
  // dragging to a precise position in the destination. Matches the
  // task-card nest-zone spring-load timing.
  useEffect(() => {
    if (!isOver || isActive) return;
    const handle = setTimeout(() => onLongHover(), 700);
    return () => clearTimeout(handle);
  }, [isOver, isActive, onLongHover]);

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

/**
 * Bottom-center error toast for failed drops. Auto-dismisses after 5s.
 * Sits above the bottom tabs (z-[60]) so it's visible regardless of
 * which view the user is in.
 */
function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, 5000);
    return () => clearTimeout(handle);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-700 bg-red-600 px-4 py-2 text-white shadow-md"
    >
      <span className="text-sm">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-white/70 hover:text-white"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
