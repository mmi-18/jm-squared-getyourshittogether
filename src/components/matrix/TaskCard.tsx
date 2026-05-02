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

const MAX_VISIBLE_TAG_BADGES = 3;

/**
 * Single-line draggable + sortable task card.
 *
 * Layout (left → right):
 *   [☐] | title (truncates) | [In 5d] [Vol] [ITB] [📄] [✏️] [🗑️]
 *
 * Card visuals:
 *   - 6px colored bar on the left edge — matches the tag color (single
 *     tag) or vertical gradient of all tag colors (multi-tag).
 *   - Background tint — diagonal gradient fading from the tag color(s)
 *     so the whole card reads as "belonging" to its tag(s) at a glance.
 *     Multi-tag → diagonal blend of all colors fading into each other,
 *     per the spec.
 *
 * Tag badges (right side, after deadline):
 *   - Small rounded rectangles (NOT circles), 3-char uppercase
 *     abbreviation, white text on the tag's color, full name on hover.
 *   - Capped at MAX_VISIBLE_TAG_BADGES with a `+N` overflow chip; the
 *     edit modal lists the full set.
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

  const visibleTags = taskTags.slice(0, MAX_VISIBLE_TAG_BADGES);
  const overflowCount = taskTags.length - visibleTags.length;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
    background: tint !== "transparent" ? tint : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // shrink-0: don't let flex squish cards when crowded — body scrolls instead
        "border-border bg-surface group relative flex shrink-0 flex-col overflow-hidden rounded-[6px] border shadow-sm",
        task.completed && "bg-muted/40",
      )}
    >
      {/* Colored left bar (6px) */}
      <span
        className="absolute bottom-0 left-0 top-0 w-[6px]"
        style={{ background: bar }}
      />

      {/* ── One-line row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 py-1.5 pl-3.5 pr-1.5">
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "border-border-strong flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border bg-white transition-colors",
            task.completed && "border-emerald-500 bg-emerald-500 text-white",
          )}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
        </button>

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
              dl.tone === "default" && "bg-white/70 text-muted-foreground",
            )}
          >
            {dl.label}
          </span>
        )}

        {/* Tag badges — right of deadline, before actions */}
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
                className="bg-white/85 text-muted-foreground inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-[4px] px-1 text-[9.5px] font-semibold ring-1 ring-black/10"
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

        {/* Notes icon (only when the task has notes) */}
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

      {/* ── Expanded notes ────────────────────────────────────────────── */}
      {notesOpen && hasNotes && (
        <div className="border-border bg-muted/70 whitespace-pre-wrap border-t px-3 py-2 text-[12px]">
          {task.notes}
        </div>
      )}
    </div>
  );
}

/**
 * Small rectangular tag badge with rounded corners (deliberately NOT a
 * circle — that read as a generic dot earlier; rectangles look like
 * labeled chips). 3-char uppercase abbreviation; full name on hover.
 */
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
