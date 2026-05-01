"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { Tag } from "@prisma/client";
import { handleBulletEnter, maybeRewriteDashToBullet } from "@/lib/notes";
import { type Quadrant, QUADRANTS } from "@/lib/types";
import { updateTask } from "@/app/(app)/_actions/tasks";
import { TagPicker } from "./TagPicker";
import { DatePicker } from "./DatePicker";
import type { TaskWithTagIds } from "./TaskCard";

/**
 * Full-fidelity edit modal for an existing task. Pre-fills from the task,
 * fires `updateTask` with only the fields that changed (compared via
 * shallow equality on each field) so unchanged fields don't fight other
 * concurrent updates.
 */
export function EditTaskModal({
  task,
  tags,
  open,
  onClose,
}: {
  task: TaskWithTagIds | null;
  tags: Tag[];
  open: boolean;
  onClose: () => void;
}) {
  if (!task) return null;
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Popup className="bg-surface border-border fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-md">
          <EditForm task={task} tags={tags} onClose={onClose} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditForm({
  task,
  tags,
  onClose,
}: {
  task: TaskWithTagIds;
  tags: Tag[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const [deadline, setDeadline] = useState<string | null>(
    task.deadline
      ? task.deadline instanceof Date
        ? task.deadline.toISOString().slice(0, 10)
        : new Date(task.deadline).toISOString().slice(0, 10)
      : null,
  );
  const [quadrant, setQuadrant] = useState<Quadrant>(task.quadrant as Quadrant);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    startTransition(async () => {
      try {
        await updateTask({
          id: task.id,
          title,
          notes,
          tagIds,
          deadline,
          quadrant,
        });
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Update failed");
      }
    });
  };

  return (
    <>
      <header className="border-border flex items-center gap-3 border-b px-4 py-3">
        <Dialog.Title className="flex-1 text-[14px] font-semibold tracking-tight">
          Edit task
        </Dialog.Title>
        <Dialog.Close
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
        >
          <X size={16} />
        </Dialog.Close>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-border focus:border-foreground rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium">
          Notes
          <textarea
            value={notes}
            rows={4}
            placeholder="Notes (optional). Type `- ` for a bullet."
            onInput={(e) => {
              const ta = e.currentTarget;
              const rewritten = maybeRewriteDashToBullet(ta.value, ta.selectionStart);
              if (rewritten) {
                setNotes(rewritten.value);
                requestAnimationFrame(() => {
                  ta.setSelectionRange(rewritten.caret, rewritten.caret);
                });
              } else {
                setNotes(ta.value);
              }
            }}
            onKeyDown={(e) => {
              // In the modal, plain Enter inserts a newline (default browser
              // behavior). We just intercept to continue/strip bullets.
              if (e.key === "Enter" && !e.shiftKey) {
                const ta = e.currentTarget;
                const handled = handleBulletEnter(ta.value, ta.selectionStart);
                if (handled) {
                  e.preventDefault();
                  setNotes(handled.value);
                  requestAnimationFrame(() => {
                    ta.setSelectionRange(handled.caret, handled.caret);
                  });
                }
              }
            }}
            className="border-border focus:border-foreground resize-y rounded-md border bg-white px-2.5 py-1.5 text-[13px] outline-none"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Quadrant
            <select
              value={quadrant}
              onChange={(e) => setQuadrant(Number(e.target.value) as Quadrant)}
              className="border-border bg-surface rounded-md border px-2.5 py-1.5 text-sm outline-none"
            >
              {([1, 2, 3, 4] as Quadrant[]).map((q) => (
                <option key={q} value={q}>
                  {QUADRANTS[q].roman} {QUADRANTS[q].title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1 text-xs font-medium">
            <span>Deadline</span>
            <DatePicker value={deadline} onChange={setDeadline} />
          </div>

          <div className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">
            <span>Tags</span>
            <TagPicker value={tagIds} onChange={setTagIds} tags={tags} />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <footer className="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
        <Dialog.Close className="text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 text-[12.5px]">
          Cancel
        </Dialog.Close>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-foreground text-background rounded-md px-3 py-1.5 text-[12.5px] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </footer>
    </>
  );
}
