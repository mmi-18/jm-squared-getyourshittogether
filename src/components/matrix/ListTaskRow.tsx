"use client";

import { useState } from "react";
import { Check, FileText, X as XIcon } from "lucide-react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  effectiveTagColor,
  formatDeadline,
  QUADRANT_ACCENT,
} from "@/lib/quadrant-utils";
import { QUADRANTS, type Quadrant } from "@/lib/types";
import { TaskMenu } from "./TaskMenu";
import type { TaskWithTagIds } from "./TaskCard";

const MAX_VISIBLE_TAG_BADGES = 3;

/**
 * One row in the Today / Upcoming list view. Lighter than TaskCard:
 * no drag handles, no fold/unfold, no nesting. Adds a colored quadrant
 * badge on the left so the matrix priority of each task is visible
 * even outside the matrix layout.
 *
 * Subtasks show a "↗ parent title" link below the title for context.
 */
export function ListTaskRow({
  task,
  parentTitle,
  tagsById,
  disabled,
  onToggle,
  onSetDeadline,
  onAddSubtask,
  onEdit,
  onToggleWontDo,
  onDelete,
}: {
  task: TaskWithTagIds;
  parentTitle: string | null;
  tagsById: Map<string, Tag>;
  disabled: boolean;
  onToggle: () => void;
  onSetDeadline: (deadline: string | null) => void;
  onAddSubtask: () => void;
  onEdit: () => void;
  onToggleWontDo: () => void;
  onDelete: () => void;
}) {
  const meta = QUADRANTS[task.quadrant as Quadrant];
  const accent = QUADRANT_ACCENT[task.quadrant as Quadrant];

  const taskTags = task.tagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is Tag => Boolean(t));
  const dl = task.deadline ? formatDeadline(task.deadline) : null;

  const visibleTags = taskTags.slice(0, MAX_VISIBLE_TAG_BADGES);
  const overflowCount = taskTags.length - visibleTags.length;

  const [notesOpen, setNotesOpen] = useState(false);
  const hasNotes = task.notes.trim().length > 0;

  return (
    <div
      className={cn(
        "border-border bg-surface flex flex-col rounded-md border shadow-sm",
        (task.completed || task.wontDo) && "bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2 py-2 pl-2 pr-1.5">
        {/* Quadrant Roman marker — colored chip with the quadrant accent */}
        <span
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[12px] font-bold leading-none"
          style={{ backgroundColor: `${accent}26`, color: accent }}
          title={`${meta.roman} ${meta.title}`}
        >
          {meta.roman}
        </span>

        {/* Checkbox */}
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
            task.wontDo && "border-rose-500 bg-rose-500 text-white",
          )}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
          {task.wontDo && !task.completed && <XIcon size={11} strokeWidth={3} />}
        </button>

        {/* Title + parent context */}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[13.5px]",
              (task.completed || task.wontDo) &&
                "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </div>
          {parentTitle && (
            <div className="text-muted-foreground mt-px truncate text-[10.5px]">
              ↗ {parentTitle}
            </div>
          )}
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
              <span
                key={tag.id}
                className="inline-flex h-[18px] flex-shrink-0 items-center justify-center rounded-[4px] px-1.5 text-[9.5px] font-bold uppercase leading-none text-white shadow-sm ring-1 ring-black/5"
                style={{ background: effectiveTagColor(tag, tagsById) }}
                title={tag.name}
              >
                {tag.name.trim().slice(0, 3).toUpperCase() || "•"}
              </span>
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

        <TaskMenu
          task={task}
          onSetDeadline={onSetDeadline}
          onAddSubtask={onAddSubtask}
          onEdit={onEdit}
          onToggleWontDo={onToggleWontDo}
          onDelete={onDelete}
        />
      </div>

      {notesOpen && hasNotes && (
        <div className="border-border bg-muted/70 whitespace-pre-wrap border-t px-3 py-2 text-[12px]">
          {task.notes}
        </div>
      )}
    </div>
  );
}
