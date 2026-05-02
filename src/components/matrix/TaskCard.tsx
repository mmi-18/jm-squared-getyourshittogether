"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, GripVertical, Pencil, Trash2 } from "lucide-react";
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
  disabled,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: TaskWithTagIds;
  tagsById: Map<string, Tag>;
  depth?: number;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  const sortable = useSortable({
    id: task.id,
    data: {
      type: "task",
      quadrant: task.quadrant,
      parentId: task.parentId,
      depth,
    },
    // Subtasks aren't individually draggable. Reorder/move only fires from
    // the top-level cards; subtasks follow their parent's quadrant.
    disabled: depth > 0,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  // Separate droppable so other tasks can be dragged ONTO this one to
  // nest under it. id is namespaced ("nest-...") so the collision
  // detector in MatrixClient can tell nest from reorder.
  const nest = useDroppable({
    id: `nest-${task.id}`,
    data: { type: "nest", taskId: task.id },
  });

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

  // Combine the sortable + droppable refs onto the same DOM node.
  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    nest.setNodeRef(el);
  };

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
    background: tint !== "transparent" ? tint : undefined,
    marginLeft: depth * 24,
  };

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        "border-border bg-surface group relative flex shrink-0 flex-col overflow-hidden rounded-[6px] border shadow-sm",
        task.completed && "bg-muted/40",
        // Active nest target — outline + NEST badge below.
        nest.isOver && !isDragging && "ring-2 ring-[var(--accent)] ring-offset-1",
      )}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-[6px]"
        style={{ background: bar }}
      />

      {nest.isOver && !isDragging && (
        <span className="bg-accent pointer-events-none absolute right-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
          Nest
        </span>
      )}

      {/* ── One-line row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 py-1.5 pl-3.5 pr-1.5">
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "border-border-strong flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border bg-surface transition-colors",
            task.completed && "border-emerald-500 bg-emerald-500 text-white",
          )}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
        </button>

        {/* Title — drag handle when depth=0; static for subtasks */}
        <div
          {...(depth === 0 ? attributes : {})}
          {...(depth === 0 ? listeners : {})}
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px]",
            depth === 0 && "cursor-grab active:cursor-grabbing",
            task.completed && "text-muted-foreground line-through",
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

        {/* Drag handle (top-level only) — wired to dnd-kit listeners */}
        {depth === 0 && (
          <span
            {...listeners}
            role="button"
            aria-label="Drag to reorder, move, or nest"
            className="text-subtle hover:text-foreground hidden h-6 w-4 flex-shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing group-hover:flex"
          >
            <GripVertical size={12} />
          </span>
        )}

        {onEdit && (
          <button
            onClick={onEdit}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
            aria-label="Edit task"
          >
            <Pencil size={13} />
          </button>
        )}

        <button
          onClick={onDelete}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {notesOpen && hasNotes && (
        <div className="border-border bg-muted/70 whitespace-pre-wrap border-t px-3 py-2 text-[12px]">
          {task.notes}
        </div>
      )}
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
