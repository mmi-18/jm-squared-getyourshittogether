"use client";

import type { Tag } from "@prisma/client";
import { ListTaskRow } from "./ListTaskRow";
import type { TaskWithTagIds } from "./TaskCard";

/**
 * Today / Upcoming list view. Receives an already-filtered, already-sorted
 * task list from MatrixClient and just renders rows. No DnD here.
 */
export function ListView({
  tasks,
  parentTitleById,
  tagsById,
  pending,
  emptyMessage,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  onSetDeadline,
  onAddSubtask,
  onToggleWontDo,
}: {
  tasks: TaskWithTagIds[];
  parentTitleById: Map<string, string>;
  tagsById: Map<string, Tag>;
  pending: boolean;
  emptyMessage: string;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onEditTask: (task: TaskWithTagIds) => void;
  onSetDeadline: (id: string, deadline: string | null) => void;
  onAddSubtask: (parentId: string) => void;
  onToggleWontDo: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
      {tasks.length === 0 ? (
        <p className="text-muted-foreground border-border-strong mt-4 rounded-[10px] border border-dashed bg-surface py-10 text-center text-[12.5px] italic">
          {emptyMessage}
        </p>
      ) : (
        tasks.map((task) => (
          <ListTaskRow
            key={task.id}
            task={task}
            parentTitle={
              task.parentId ? parentTitleById.get(task.parentId) ?? null : null
            }
            tagsById={tagsById}
            disabled={pending}
            onToggle={() => onToggleTask(task.id)}
            onSetDeadline={(d) => onSetDeadline(task.id, d)}
            onAddSubtask={() => onAddSubtask(task.id)}
            onEdit={() => onEditTask(task)}
            onToggleWontDo={() => onToggleWontDo(task.id)}
            onDelete={() => onDeleteTask(task.id)}
          />
        ))
      )}
    </div>
  );
}
