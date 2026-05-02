"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { Tag, Task } from "@prisma/client";
import { cn } from "@/lib/utils";
import { effectiveTagColor, formatDeadline } from "@/lib/quadrant-utils";

export type TaskWithTagIds = Task & { tagIds: string[] };

const MAX_VISIBLE_TAG_DOTS = 3;

/**
 * Single-line draggable + sortable task card.
 *
 * Layout (left → right):
 *   [☐] [●W] [●A] [+2] | title (truncates) | [In 5d] [📄] [✏️] [🗑️]
 *
 * Tags render as small colored circles with the tag's first letter in
 * white. Cap visible dots at MAX_VISIBLE_TAG_DOTS so a tag-heavy task
 * still fits one line on a phone — extras roll up into a `+N` chip
 * (the full set is always visible in the edit modal).
 *
 * The title is the drag handle. Touch sensors on the parent DndContext
 * apply a 200ms long-press delay so taps to check off / open the
 * edit modal don't accidentally start a drag.
 */
export function TaskCard({
  task,
  tagsById,
  disabled,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: TaskWithTagIds;
  tagsById: Map<string, Tag>;
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
    },
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  const taskTags = task.tagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is Tag => Boolean(t));
  const dl = task.deadline ? formatDeadline(task.deadline) : null;

  const [notesOpen, setNotesOpen] = useState(false);
  const hasNotes = task.notes.trim().length > 0;

  const visibleTags = taskTags.slice(0, MAX_VISIBLE_TAG_DOTS);
  const overflowCount = taskTags.length - visibleTags.length;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // shrink-0 so flex column doesn't squish cards when crowded
        "border-border bg-surface group relative flex shrink-0 flex-col overflow-hidden rounded-[6px] border shadow-sm",
        task.completed && "bg-muted/40",
      )}
    >
      {/* ── One-line row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 py-1.5 pl-2 pr-1.5">
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "border-border-strong flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "bg-white",
          )}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
        </button>

        {/* Tag dots — colored circle + first letter */}
        {visibleTags.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-0.5" aria-label="Tags">
            {visibleTags.map((tag) => (
              <TagDot key={tag.id} tag={tag} color={effectiveTagColor(tag, tagsById)} />
            ))}
            {overflowCount > 0 && (
              <span
                className="bg-muted text-muted-foreground inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9.5px] font-semibold ring-1 ring-black/10"
                title={taskTags.slice(MAX_VISIBLE_TAG_DOTS).map((t) => t.name).join(", ")}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {/* Title — drag handle, takes remaining width */}
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "min-w-0 flex-1 cursor-grab truncate text-[13.5px] active:cursor-grabbing",
            task.completed && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>

        {/* Deadline pill */}
        {dl && (
          <span
            className={cn(
              "inline-flex flex-shrink-0 items-center rounded-[4px] px-1.5 py-px text-[10.5px] font-medium",
              dl.tone === "overdue" && "bg-red-100 text-red-700",
              dl.tone === "soon" && "bg-amber-100 text-amber-800",
              dl.tone === "default" && "bg-muted text-muted-foreground",
            )}
          >
            {dl.label}
          </span>
        )}

        {/* Notes toggle (only if the task has notes) */}
        {hasNotes && (
          <button
            onClick={() => setNotesOpen((v) => !v)}
            aria-label={notesOpen ? "Collapse notes" : "Expand notes"}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded",
              notesOpen && "text-foreground bg-muted",
            )}
          >
            <FileText size={13} />
          </button>
        )}

        {/* Drag affordance — desktop hover only */}
        <span
          aria-hidden
          className="text-subtle hidden h-6 w-3 flex-shrink-0 items-center justify-center group-hover:flex"
          title="Drag to reorder or move"
        >
          <GripVertical size={11} />
        </span>

        {onEdit && (
          <button
            onClick={onEdit}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
            aria-label="Edit task"
          >
            <Pencil size={13} />
          </button>
        )}

        <button
          onClick={onDelete}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* ── Expanded notes (separate row) ────────────────────────────── */}
      {notesOpen && hasNotes && (
        <div className="border-border bg-muted/60 whitespace-pre-wrap border-t px-3 py-2 text-[12px]">
          {task.notes}
        </div>
      )}
    </div>
  );
}

/**
 * One tag rendered as a small colored circle with the tag's first letter
 * in white. `title` attribute gives a hover tooltip on desktop with the
 * full tag name; the edit modal still lists tags by full name for the
 * mobile case where hover doesn't exist.
 */
function TagDot({ tag, color }: { tag: Tag; color: string }) {
  const initial = (tag.name.trim()[0] ?? "·").toUpperCase();
  return (
    <span
      className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold leading-none text-white shadow-sm ring-1 ring-black/10"
      style={{ background: color }}
      title={tag.name}
      aria-label={tag.name}
    >
      {initial}
    </span>
  );
}
