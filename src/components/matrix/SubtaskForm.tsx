"use client";

import { useEffect, useState } from "react";
import { CornerDownRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline subtask quick-add form. Renders below the parent task in the
 * QuadrantPanel when the user clicks "Add subtask" in the task menu.
 *
 * UX:
 *   - Title input is autofocused.
 *   - Enter → submits, clears input, stays open for batch-adding more
 *     siblings (rapid entry of "Design / Code / Test" type subtasks).
 *   - Esc or the × button → closes.
 *   - Click outside the form ALSO closes (handled in MatrixClient via
 *     a document mousedown listener that ignores form clicks).
 */
export function SubtaskForm({
  parentTitle,
  depth,
  onSubmit,
  onCancel,
}: {
  parentTitle: string;
  depth: number;
  /** Called with a non-empty trimmed title. */
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");

  // Close on Esc (browser-wide so it works when input has focus too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onSubmit(t);
    setTitle("");
  };

  return (
    <div
      data-subtask-form
      style={{ marginLeft: (depth + 1) * 24 }}
      className={cn(
        "border-accent/40 bg-surface flex flex-shrink-0 items-center gap-2 rounded-[6px] border-l-4 px-2.5 py-2 shadow-sm",
      )}
    >
      <CornerDownRight
        size={13}
        className="text-muted-foreground flex-shrink-0"
      />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={`New subtask of "${parentTitle}"…`}
        className="placeholder:text-muted-foreground border-none bg-transparent text-[13px] outline-none flex-1"
      />
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close subtask form"
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
      >
        <X size={13} />
      </button>
    </div>
  );
}
