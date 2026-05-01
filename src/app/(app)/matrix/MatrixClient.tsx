"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Trash2, LogOut } from "lucide-react";
import type { Tag, Task } from "@prisma/client";
import { signOut } from "@/lib/auth-client";
import { QUADRANTS, type Quadrant } from "@/lib/types";
import {
  buildTaskBar,
  buildTaskTint,
  effectiveTagColor,
  formatDeadline,
  QUADRANT_ACCENT,
} from "@/lib/quadrant-utils";
import {
  createTask,
  deleteTask,
  toggleTaskCompleted,
} from "../_actions/tasks";

type TaskWithTagIds = Task & { tagIds: string[] };

/**
 * Phase 1B-α matrix UI.
 *
 * Bare bones — renders the four quadrants, lists tasks, supports the three
 * essential mutations (create / toggle / soft-delete) via server actions.
 * No drag-and-drop yet (that's 1B-β), no tag manager UI (1B-β), no schedules
 * (1B-γ), no offline sync (1B-γ).
 *
 * Mutation pattern: every action is wrapped in startTransition() so the UI
 * stays responsive, then `router.refresh()` re-renders the server component
 * with the post-mutation state. Optimistic updates can come later.
 */
export function MatrixClient({
  initialTasks,
  initialTags,
  userEmail,
}: {
  initialTasks: TaskWithTagIds[];
  initialTags: Tag[];
  userEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Show only top-level tasks per quadrant for now. Subtasks render under
  // their parents in 1B-β when nesting UI lands.
  const tasksByQuadrant = useMemo(() => {
    const map: Record<Quadrant, TaskWithTagIds[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const t of initialTasks) {
      if (t.parentId) continue; // subtasks rendered nested in next phase
      map[t.quadrant as Quadrant].push(t);
    }
    return map;
  }, [initialTasks]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of initialTags) m.set(t.id, t);
    return m;
  }, [initialTags]);

  return (
    <div className="bg-background flex h-screen flex-col">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="bg-surface border-border flex flex-shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <h1 className="text-[15px] font-semibold tracking-tight">
          Get Your Shit Together
        </h1>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {userEmail}
        </span>
        <div className="flex-1" />
        <button
          onClick={() =>
            startTransition(async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            })
          }
          className="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs"
          aria-label="Sign out"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </header>

      {/* ── Matrix grid ─────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-4 gap-2 p-2 md:grid-cols-2 md:grid-rows-2">
        {(Object.keys(QUADRANTS) as unknown as Quadrant[]).map((qStr) => {
          const q = Number(qStr) as Quadrant;
          return (
            <QuadrantPanel
              key={q}
              quadrant={q}
              tasks={tasksByQuadrant[q]}
              tagsById={tagsById}
              pending={pending}
              onCreate={(title) =>
                startTransition(async () => {
                  await createTask({ title, quadrant: q });
                  router.refresh();
                })
              }
              onToggle={(id) =>
                startTransition(async () => {
                  await toggleTaskCompleted(id);
                  router.refresh();
                })
              }
              onDelete={(id) =>
                startTransition(async () => {
                  await deleteTask(id);
                  router.refresh();
                })
              }
            />
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function QuadrantPanel({
  quadrant,
  tasks,
  tagsById,
  pending,
  onCreate,
  onToggle,
  onDelete,
}: {
  quadrant: Quadrant;
  tasks: TaskWithTagIds[];
  tagsById: Map<string, Tag>;
  pending: boolean;
  onCreate: (title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = QUADRANTS[quadrant];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const t = draft.trim();
    if (!t) {
      setAdding(false);
      return;
    }
    onCreate(t);
    setDraft("");
    setAdding(false);
  };

  return (
    <section
      data-q={quadrant}
      className="bg-surface border-border relative flex min-h-0 flex-col overflow-hidden rounded-[10px] border"
      style={{ ["--q-accent" as never]: QUADRANT_ACCENT[quadrant] }}
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
          onClick={() => setAdding(true)}
          className="border-border bg-surface inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border hover:bg-muted"
          style={{ color: "var(--q-accent)" }}
          aria-label="Add task"
        >
          <Plus size={14} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2.5 pt-1.5">
        {tasks.length === 0 && !adding && (
          <p className="text-subtle border-border-strong mt-1 rounded-[10px] border border-dashed bg-white py-4 text-center text-[12px] italic">
            Nothing here yet.
          </p>
        )}

        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            tagsById={tagsById}
            disabled={pending}
            onToggle={() => onToggle(task.id)}
            onDelete={() => onDelete(task.id)}
          />
        ))}

        {adding && (
          <div className="border-border bg-surface flex items-center gap-2 rounded-[6px] border p-2 shadow-sm">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                else if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              onBlur={submit}
              placeholder="Task title…"
              className="border-none bg-transparent text-sm outline-none flex-1"
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function TaskRow({
  task,
  tagsById,
  disabled,
  onToggle,
  onDelete,
}: {
  task: TaskWithTagIds;
  tagsById: Map<string, Tag>;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const taskTags = task.tagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is Tag => Boolean(t));
  const colors = taskTags.map((t) => effectiveTagColor(t, tagsById));
  const tint = buildTaskTint(colors);
  const bar = buildTaskBar(colors);

  const dl = task.deadline ? formatDeadline(task.deadline) : null;

  return (
    <div
      className={`border-border bg-surface relative flex flex-col gap-1 overflow-hidden rounded-[6px] border py-2 pl-4 pr-2.5 shadow-sm transition-opacity ${task.completed ? "opacity-55" : ""}`}
      style={{ background: tint !== "transparent" ? tint : undefined }}
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
          className={`border-border-strong flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors ${task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "bg-white"}`}
        >
          {task.completed && <Check size={11} strokeWidth={3} />}
        </button>
        <div
          className={`min-w-0 flex-1 truncate text-[13.5px] ${task.completed ? "line-through" : ""}`}
        >
          {task.title}
        </div>
        <button
          onClick={onDelete}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {(dl || taskTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {dl && (
            <span
              className={`inline-flex items-center rounded-[4px] px-1.5 py-px text-[10.5px] font-medium ${
                dl.tone === "overdue"
                  ? "bg-red-100 text-red-700"
                  : dl.tone === "soon"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {dl.label}
            </span>
          )}
          {taskTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex max-w-[110px] items-center gap-1 truncate rounded-full bg-white/85 px-1.5 py-0.5 text-[10.5px] text-foreground"
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{
                  background: effectiveTagColor(tag, tagsById),
                }}
              />
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
