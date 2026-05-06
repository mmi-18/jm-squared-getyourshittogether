"use client";

import { Menu } from "@base-ui/react/menu";
import {
  CalendarClock,
  CalendarX,
  CornerDownRight,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  XSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskWithTagIds } from "./TaskCard";

/**
 * Per-task dropdown menu: replaces the previous edit + delete buttons
 * with a single ⋮ trigger that opens a context menu.
 *
 * Items:
 *   ─ Deadline shortcuts (today / tomorrow / +1 week / clear)
 *   ─ Add subtask (opens an inline form below the parent)
 *   ─ Edit details (opens the full modal)
 *   ─ Won't do  (or "Restore as active" when already won't-do)
 *   ─ Delete (soft, with undo toast)
 *
 * Uses @base-ui/react/menu's Positioner so the popup auto-flips above
 * the trigger when the task is near the bottom of the screen — no
 * clipping at the viewport edge.
 */
export function TaskMenu({
  task,
  onSetDeadline,
  onAddSubtask,
  onEdit,
  onToggleWontDo,
  onDelete,
}: {
  task: TaskWithTagIds;
  onSetDeadline: (deadline: string | null) => void;
  onAddSubtask: () => void;
  onEdit: () => void;
  onToggleWontDo: () => void;
  onDelete: () => void;
}) {
  const todayIso = isoOffset(0);
  const tomorrowIso = isoOffset(1);
  const inAWeekIso = isoOffset(7);

  return (
    <Menu.Root>
      <Menu.Trigger
        className="text-muted-foreground hover:text-foreground hover:bg-muted/80 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
        aria-label="Task menu"
      >
        <MoreVertical size={14} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="border-border bg-surface text-foreground min-w-[200px] rounded-lg border p-1 shadow-md outline-none">
            <ItemRow icon={<CalendarClock size={13} />} onClick={() => onSetDeadline(todayIso)}>
              Due today
            </ItemRow>
            <ItemRow icon={<CalendarClock size={13} />} onClick={() => onSetDeadline(tomorrowIso)}>
              Due tomorrow
            </ItemRow>
            <ItemRow icon={<CalendarClock size={13} />} onClick={() => onSetDeadline(inAWeekIso)}>
              Due in 1 week
            </ItemRow>
            <ItemRow icon={<CalendarX size={13} />} onClick={() => onSetDeadline(null)} disabled={!task.deadline}>
              Clear deadline
            </ItemRow>

            <Separator />

            <ItemRow icon={<CornerDownRight size={13} />} onClick={onAddSubtask}>
              Add subtask
            </ItemRow>
            <ItemRow icon={<Pencil size={13} />} onClick={onEdit}>
              Edit details
            </ItemRow>

            <Separator />

            {task.wontDo ? (
              <ItemRow icon={<RotateCcw size={13} />} onClick={onToggleWontDo}>
                Restore as active
              </ItemRow>
            ) : (
              <ItemRow icon={<XSquare size={13} />} onClick={onToggleWontDo}>
                Won&apos;t do
              </ItemRow>
            )}
            <ItemRow icon={<Trash2 size={13} />} onClick={onDelete} destructive>
              Delete
            </ItemRow>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function ItemRow({
  icon,
  onClick,
  disabled,
  destructive,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Menu.Item
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors",
        "data-[highlighted]:bg-muted",
        destructive
          ? "text-red-600 data-[highlighted]:text-red-700 dark:text-red-400 dark:data-[highlighted]:text-red-300"
          : "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
    </Menu.Item>
  );
}

function Separator() {
  return <div className="bg-border my-1 h-px" />;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
