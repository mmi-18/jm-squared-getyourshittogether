"use client";

import { Plus } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { QUADRANTS, type Quadrant } from "@/lib/types";
import { QUADRANT_ACCENT } from "@/lib/quadrant-utils";
import { TaskCard, type TaskWithTagIds } from "./TaskCard";
import { InlineTaskForm } from "./InlineTaskForm";

/**
 * One quadrant of the 2×2 matrix.
 *
 * Wrapped in a SortableContext so @dnd-kit can reorder tasks within it. The
 * panel itself is also a `useDroppable` so empty quadrants accept drops
 * (otherwise an empty SortableContext has no hit area).
 */
export function QuadrantPanel({
  quadrant,
  tasks,
  tags,
  tagsById,
  pending,
  adding,
  onStartAdd,
  onCancelAdd,
  onSubmitTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
}: {
  quadrant: Quadrant;
  tasks: TaskWithTagIds[];
  tags: Tag[];
  tagsById: Map<string, Tag>;
  pending: boolean;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onSubmitTask: (input: {
    title: string;
    notes: string;
    tagIds: string[];
    deadline: string | null;
  }) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onEditTask: (task: TaskWithTagIds) => void;
}) {
  const meta = QUADRANTS[quadrant];
  const { isOver, setNodeRef } = useDroppable({
    id: `quadrant-${quadrant}`,
    data: { type: "quadrant", quadrant },
  });

  const taskIds = tasks.map((t) => t.id);

  return (
    <section
      data-q={quadrant}
      className={cn(
        "bg-surface border-border relative flex min-h-0 flex-col overflow-hidden rounded-[10px] border transition-shadow",
        isOver && "ring-2",
      )}
      style={
        {
          ["--q-accent" as never]: QUADRANT_ACCENT[quadrant],
          ...(isOver
            ? { boxShadow: `0 0 0 2px ${QUADRANT_ACCENT[quadrant]}` }
            : {}),
        } as React.CSSProperties
      }
    >
      <div
        className="absolute left-0 right-0 top-0 h-[3px]"
        style={{ background: "var(--q-accent)" }}
      />

      <header className="flex flex-shrink-0 items-start gap-2.5 px-3 pt-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-[11.5px] font-semibold uppercase tracking-[0.05em]"
            style={{ color: "var(--q-accent)" }}
          >
            {meta.roman} {meta.title}
          </div>
          <div className="text-muted-foreground mt-px text-[11.5px]">
            {meta.subtitle}
          </div>
        </div>
        <button
          onClick={onStartAdd}
          className="border-border bg-surface hover:bg-muted inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border"
          style={{ color: "var(--q-accent)" }}
          aria-label="Add task"
        >
          <Plus size={14} />
        </button>
      </header>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2.5 pt-1.5"
        >
          {tasks.length === 0 && !adding && (
            <p className="text-subtle border-border-strong mt-1 rounded-[10px] border border-dashed bg-surface py-4 text-center text-[12px] italic">
              Nothing here yet.
            </p>
          )}

          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              tagsById={tagsById}
              disabled={pending}
              onToggle={() => onToggleTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
              onEdit={() => onEditTask(task)}
            />
          ))}

          {adding && (
            <InlineTaskForm
              tags={tags}
              onSubmit={onSubmitTask}
              onCancel={onCancelAdd}
            />
          )}
        </div>
      </SortableContext>
    </section>
  );
}
