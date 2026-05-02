"use client";

import { useState } from "react";
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

/**
 * A draggable + sortable task card.
 *
 * The card is the drag handle (per spec: "whole card draggable"). Touch
 * support comes from the @dnd-kit TouchSensor configured on the parent
 * DndContext with a small activation delay so taps don't accidentally drag.
 *
 * `data` on the sortable carries the task's quadrant + parentId so the
 * DndContext-level `onDragEnd` can detect cross-quadrant drops cheaply
 * without re-traversing the source containers.
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
  const colors = taskTags.map((t) => effectiveTagColor(t, tagsById));
  const tint = buildTaskTint(colors);
  const bar = buildTaskBar(colors);
  const dl = task.deadline ? formatDeadline(task.deadline) : null;

  const [notesOpen, setNotesOpen] = useState(false);
  const hasNotes = task.notes.trim().length > 0;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: tint !== "transparent" ? tint : undefined,
    touchAction: "manipulation", // let the touch sensor handle long-press drag
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // `shrink-0` is critical: without it, when a quadrant has more
        // tasks than fit in its body, flex's default shrink:1 squishes
        // each card vertically (clipping titles and pills) instead of
        // letting the body scroll. shrink-0 pins each card at natural
        // height; the body's overflow-y-auto then scrolls.
        "border-border bg-surface group relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-[6px] border py-2 pl-4 pr-2 shadow-sm",
        // Completed visual: subtler bg shift + strikethrough on title
        // (handled below). The previous `opacity-55` faded the whole
        // card including the colored bar, making completed tasks hard
        // to scan when "Show completed" is on.
        task.completed && "bg-muted/40",
      )}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-[6px]"
        style={{ background: bar }}
      />
      <div className="flex items-center gap-2">
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

        {hasNotes && (
          <button
            onClick={() => setNotesOpen((v) => !v)}
            aria-label={notesOpen ? "Collapse notes" : "Expand notes"}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded",
              notesOpen && "text-foreground bg-muted",
            )}
          >
            <FileText size={13} />
          </button>
        )}

        <span
          aria-hidden
          className="text-subtle hidden h-6 w-4 items-center justify-center group-hover:flex"
          title="Drag to reorder or move"
        >
          <GripVertical size={12} />
        </span>

        {onEdit && (
          <button
            onClick={onEdit}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded"
            aria-label="Edit task"
          >
            <Pencil size={13} />
          </button>
        )}

        <button
          onClick={onDelete}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded"
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {(dl || taskTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {dl && (
            <span
              className={cn(
                "inline-flex items-center rounded-[4px] px-1.5 py-px text-[10.5px] font-medium",
                dl.tone === "overdue" && "bg-red-100 text-red-700",
                dl.tone === "soon" && "bg-amber-100 text-amber-800",
                dl.tone === "default" && "bg-muted text-muted-foreground",
              )}
            >
              {dl.label}
            </span>
          )}
          {taskTags.map((tag) => (
            <span
              key={tag.id}
              className="text-foreground inline-flex max-w-[110px] items-center gap-1 truncate rounded-full bg-white/85 px-1.5 py-0.5 text-[10.5px]"
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ background: effectiveTagColor(tag, tagsById) }}
              />
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
        </div>
      )}

      {notesOpen && hasNotes && (
        <div className="bg-muted/60 border-border mt-1 whitespace-pre-wrap rounded p-2 text-[12px]">
          {task.notes}
        </div>
      )}
    </div>
  );
}
