"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import {
  Check,
  ChevronRight,
  FileText,
  GripVertical,
  X as XIcon,
} from "lucide-react";
import { TaskMenu } from "./TaskMenu";
import type { Tag, Task } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  buildTaskBar,
  buildTaskTint,
  effectiveTagColor,
  formatDeadline,
} from "@/lib/quadrant-utils";

export type TaskWithTagIds = Task & { tagIds: string[] };

const MAX_VISIBLE_TAG_BADGES = 3;

/**
 * Single-line draggable + sortable task card with subtask indent +
 * drag-to-nest support.
 *
 * Two dnd-kit hooks:
 *   - useSortable for reorder. Disabled at depth > 0 — subtasks aren't
 *     individually draggable (re-parent via the edit modal). Keeps the
 *     drop logic tractable.
 *   - useDroppable with id `nest-{task.id}` so this card is also a
 *     valid nest target for *other* dragged cards. Custom collision
 *     detection in MatrixClient picks this droppable when the pointer
 *     is over a card; otherwise sortable wins for gap-based reorder.
 *
 * The depth prop drives left margin so subtasks visually nest under
 * their parent. The 6px colored bar moves with the card (it's left:0
 * inside a relative parent), giving a stair-step depth indicator.
 */
export function TaskCard({
  task,
  tagsById,
  depth = 0,
  hasChildren = false,
  isCollapsed = false,
  onToggleCollapsed,
  disabled,
  onToggle,
  onDelete,
  onEdit,
  onSetDeadline,
  onAddSubtask,
  onToggleWontDo,
}: {
  task: TaskWithTagIds;
  tagsById: Map<string, Tag>;
  depth?: number;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onSetDeadline?: (deadline: string | null) => void;
  onAddSubtask?: () => void;
  onToggleWontDo?: () => void;
}) {
  const sortable = useSortable({
    id: task.id,
    data: {
      type: "task",
      quadrant: task.quadrant,
      parentId: task.parentId,
      depth,
    },
  });
  const { attributes, listeners, setNodeRef, isDragging } = sortable;

  // Three explicit drop zones per card, overlaying the card's top 30%,
  // middle 40%, bottom 30% (with 18px minima for short cards). Each is
  // its own droppable, so the collision result is unambiguous: pointer
  // in the top zone → "before", middle → "nest", bottom → "after". No
  // collision flipping = no make-room transform thrashing.
  //
  // Destructured at the call site so React 19's lint doesn't treat the
  // returned object as a ref-like value (it contains setNodeRef).
  const { setNodeRef: setBeforeRef, isOver: beforeIsOver } = useDroppable({
    id: `before-${task.id}`,
    data: { type: "before", taskId: task.id },
  });
  const { setNodeRef: setMiddleRef, isOver: middleIsOver } = useDroppable({
    id: `nest-${task.id}`,
    data: { type: "nest", taskId: task.id },
  });
  const { setNodeRef: setAfterRef, isOver: afterIsOver } = useDroppable({
    id: `after-${task.id}`,
    data: { type: "after", taskId: task.id },
  });
  const nestIsOver = middleIsOver;

  // Spring-load: if a dragged task hovers this card AS A NEST TARGET
  // and this card has folded subtasks, auto-expand after 500ms so the
  // user can keep dragging into a precise position among the children
  // (matches the iOS Finder folder spring-load + the quadrant-tab
  // spring-load).
  //
  // The callback's identity changes on every parent render (it's
  // re-created as `() => onToggleCollapsed(task.id)` in MatrixClient),
  // so listing it as a useEffect dep would reset the 500ms timer on
  // every drag-induced render and the timer would never reach the
  // threshold. Solution: stash the latest callback in a ref so the
  // effect only depends on the actual triggering state.
  const onToggleCollapsedRef = useRef(onToggleCollapsed);
  useEffect(() => {
    onToggleCollapsedRef.current = onToggleCollapsed;
  });
  useEffect(() => {
    if (!nestIsOver) return;
    if (!hasChildren || !isCollapsed) return;
    // 700ms — long enough that brief mid-zone passes during a drag don't
    // accidentally fire the spring-load. Matches the quadrant-tab
    // spring-load timing (also bumped to 700ms) for consistency.
    const handle = setTimeout(() => {
      onToggleCollapsedRef.current?.();
    }, 700);
    return () => clearTimeout(handle);
  }, [nestIsOver, hasChildren, isCollapsed]);

  const taskTags = task.tagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is Tag => Boolean(t));
  const colors = taskTags.map((t) => effectiveTagColor(t, tagsById));
  const tint = buildTaskTint(colors);
  const bar = buildTaskBar(colors);
  const dl = task.deadline ? formatDeadline(task.deadline) : null;

  const [notesOpen, setNotesOpen] = useState(false);
  const hasNotes = task.notes.trim().length > 0;

  const visibleTags = taskTags.slice(0, MAX_VISIBLE_TAG_BADGES);
  const overflowCount = taskTags.length - visibleTags.length;

  // The sortable ref attaches to the card root for drag handling. The
  // three zone droppables attach to their own overlay divs below.
  const setRefs = setNodeRef;

  // Insertion line position — driven by which zone the pointer is in.
  // The three zones (before/middle/after) are mutually exclusive
  // droppables, so at most one of these is true at any time during drag.
  const showLineAbove = beforeIsOver && !isDragging;
  const showLineBelow = afterIsOver && !isDragging;

  // CRITICAL: we deliberately DO NOT apply useSortable's transform/transition
  // to the card. The whole "make room" shift was the source of the
  // jumping the user complained about — the strategy applied a transform
  // the instant a card became "over", and as the over.id flipped between
  // sortable and nest droppables (or as cards' rects re-measured) the
  // transform would re-apply / un-apply, producing the visible bounce.
  //
  // With the new three-zone droppables (before/nest/after), the over.id
  // never matches a sortable item's id — so the strategy applies nothing
  // — so cards stay still. Insertion lines + NEST badge replace the
  // transform-based "make room" feedback.
  //
  // The dragged card itself uses opacity 0.4 to mark its source slot;
  // DragOverlay handles the floating preview.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
    background: tint !== "transparent" ? tint : undefined,
    // depth indent is on the wrapper; not duplicated here
  };

  return (
    // Wrapper holds the absolute-positioned insertion lines so they don't
    // shift the card's layout when toggling on/off.
    <div
      className="relative flex shrink-0 flex-col"
      style={{ marginLeft: depth * 24 }}
    >
      {showLineAbove && (
        <div
          aria-hidden
          className="bg-[var(--accent)] pointer-events-none absolute -top-0.5 left-2 right-2 z-20 h-1 rounded-full shadow"
        />
      )}
      {showLineBelow && (
        <div
          aria-hidden
          className="bg-[var(--accent)] pointer-events-none absolute -bottom-0.5 left-2 right-2 z-20 h-1 rounded-full shadow"
        />
      )}
    <div
      ref={setRefs}
      style={style}
      className={cn(
        "border-border bg-surface group relative flex shrink-0 flex-col overflow-hidden rounded-[6px] border shadow-sm",
        // "Done" states — completed and won't-do both fade the card body
        // but use distinct check-box / X markers below.
        (task.completed || task.wontDo) && "bg-muted/40",
        // Active nest target — outline + NEST badge below.
        nestIsOver && !isDragging && "ring-2 ring-[var(--accent)] ring-offset-1",
      )}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-[6px]"
        style={{ background: bar }}
      />

      {/* The three drop zones. They stack ABSOLUTELY over the card with
          pointer-events: none so they don't intercept clicks on the
          buttons/inputs underneath, but @dnd-kit's collision detection
          uses their getBoundingClientRect, not pointer events.
          Heights use `max(N%, 18px)` so short cards still have a
          hittable reorder zone. */}
      <div
        ref={setBeforeRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: "max(30%, 18px)" }}
      />
      <div
        ref={setMiddleRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{ top: "max(30%, 18px)", bottom: "max(30%, 18px)" }}
      />
      <div
        ref={setAfterRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: "max(30%, 18px)" }}
      />

      {nestIsOver && !isDragging && (
        <span className="bg-accent pointer-events-none absolute right-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
          Nest
        </span>
      )}

      {/* ── One-line row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 py-1.5 pl-3.5 pr-1.5">
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={
            task.completed
              ? "Mark incomplete"
              : task.wontDo
                ? "Restore as active"
                : "Mark complete"
          }
          className={cn(
            "border-border-strong flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border bg-surface transition-colors",
            task.completed && "border-emerald-500 bg-emerald-500 text-white",
            // Won't-do uses a red box with an X instead of green check.
            task.wontDo && "border-rose-500 bg-rose-500 text-white",
          )}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
          {task.wontDo && !task.completed && <XIcon size={11} strokeWidth={3} />}
        </button>

        {/* Fold/unfold chevron — only when this task has subtasks */}
        {hasChildren && onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Expand subtasks" : "Collapse subtasks"}
            aria-expanded={!isCollapsed}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition-transform",
              !isCollapsed && "rotate-90",
            )}
          >
            <ChevronRight size={12} />
          </button>
        )}

        {/* Title — drag handle (works for top-level AND subtasks) */}
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "min-w-0 flex-1 cursor-grab truncate text-[13.5px] active:cursor-grabbing",
            (task.completed || task.wontDo) &&
              "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>

        {dl && (
          <span
            className={cn(
              "inline-flex flex-shrink-0 items-center rounded-[4px] px-1.5 py-px text-[10.5px] font-medium",
              dl.tone === "overdue" && "bg-red-100 text-red-700",
              dl.tone === "soon" && "bg-amber-100 text-amber-800",
              dl.tone === "default" && "bg-surface/70 text-muted-foreground",
            )}
          >
            {dl.label}
          </span>
        )}

        {visibleTags.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-1" aria-label="Tags">
            {visibleTags.map((tag) => (
              <TagBadge
                key={tag.id}
                tag={tag}
                color={effectiveTagColor(tag, tagsById)}
              />
            ))}
            {overflowCount > 0 && (
              <span
                className="bg-surface/85 text-muted-foreground inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[4px] px-1 text-[9.5px] font-semibold ring-1 ring-black/10"
                title={taskTags
                  .slice(MAX_VISIBLE_TAG_BADGES)
                  .map((t) => t.name)
                  .join(", ")}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {hasNotes && (
          <button
            onClick={() => setNotesOpen((v) => !v)}
            aria-label={notesOpen ? "Collapse notes" : "Expand notes"}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded",
              notesOpen && "text-foreground bg-muted",
            )}
          >
            <FileText size={13} />
          </button>
        )}

        {/* Drag handle — wired to dnd-kit listeners (works for any depth) */}
        <span
          {...listeners}
          role="button"
          aria-label="Drag to reorder, move, or nest"
          className="text-subtle hover:text-foreground hidden h-6 w-4 flex-shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing group-hover:flex"
        >
          <GripVertical size={12} />
        </span>

        {/* Single ⋮ menu replacing the previous edit + delete buttons. */}
        {onSetDeadline && onAddSubtask && onEdit && onToggleWontDo && (
          <TaskMenu
            task={task}
            onSetDeadline={onSetDeadline}
            onAddSubtask={onAddSubtask}
            onEdit={onEdit}
            onToggleWontDo={onToggleWontDo}
            onDelete={onDelete}
          />
        )}
      </div>

      {notesOpen && hasNotes && (
        <div className="border-border bg-muted/70 whitespace-pre-wrap border-t px-3 py-2 text-[12px]">
          {task.notes}
        </div>
      )}
    </div>
    </div>
  );
}

function TagBadge({ tag, color }: { tag: Tag; color: string }) {
  const abbrev = tag.name.trim().slice(0, 3).toUpperCase() || "•";
  return (
    <span
      className="inline-flex h-[18px] flex-shrink-0 items-center justify-center rounded-[4px] px-1.5 text-[9.5px] font-bold uppercase leading-none text-white shadow-sm ring-1 ring-black/5"
      style={{ background: color }}
      title={tag.name}
      aria-label={tag.name}
    >
      {abbrev}
    </span>
  );
}
