"use client";

import { useRef, useState } from "react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  handleBulletEnter,
  maybeRewriteDashToBullet,
} from "@/lib/notes";
import { TagPicker } from "./TagPicker";
import { DatePicker } from "./DatePicker";

/**
 * Inline create-task form. Auto-focuses the title input. Submits on Enter
 * (when caret is in the title) or on the Add button. Esc cancels.
 *
 * The notes textarea supports the artifact's bullet auto-format:
 *   - `- ` at start-of-line → `• `
 *   - Enter on a `• ` line continues the bullet
 *   - Enter on an empty `• ` line strips the bullet
 *
 * In this inline form, plain Enter in the *title* submits; in the *notes*
 * Shift+Enter inserts a newline (and triggers bullet continuation if
 * applicable). Plain Enter in notes also continues a bullet, otherwise it
 *'s treated like Shift+Enter (matches the artifact's "if it's a bullet
 * line, continue, else newline" rule).
 */
export function InlineTaskForm({
  tags,
  onSubmit,
  onCancel,
}: {
  tags: Tag[];
  onSubmit: (input: {
    title: string;
    notes: string;
    tagIds: string[];
    deadline: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = title.trim();
    if (!t) {
      onCancel();
      return;
    }
    onSubmit({ title: t, notes, tagIds, deadline });
  };

  return (
    <div className="border-border bg-surface flex flex-col gap-2 rounded-[6px] border p-2 shadow-sm">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Task title…"
        className="border-none bg-transparent text-sm outline-none"
      />

      {showDetails && (
        <>
          <textarea
            ref={notesRef}
            value={notes}
            placeholder="Notes (optional). Type `- ` for a bullet."
            rows={2}
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
              if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
                return;
              }
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
                // Otherwise plain-Enter falls through to newline (browser default)
              }
            }}
            className="border-border focus:border-foreground resize-y rounded-md border bg-surface px-2 py-1.5 text-[13px] outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[160px] flex-1">
              <TagPicker value={tagIds} onChange={setTagIds} tags={tags} />
            </div>
            <div className="min-w-[160px] flex-1">
              <DatePicker value={deadline} onChange={setDeadline} />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        {!showDetails && (
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="text-muted-foreground hover:text-foreground text-[11.5px] underline-offset-2 hover:underline"
          >
            Add notes / tags / deadline
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground text-[11.5px]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className={cn(
            "rounded-md px-2.5 py-1 text-[12px] font-medium",
            title.trim()
              ? "bg-foreground text-background hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          Add
        </button>
      </div>
    </div>
  );
}
