"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronRight, X } from "lucide-react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DEADLINE_FILTER_LABELS, effectiveTagColor } from "@/lib/quadrant-utils";
import { buildTagTree, type TagNode } from "@/lib/tag-utils";
import type { DeadlineFilter, FilterState } from "@/lib/types";

/**
 * Filter strip — tag chips with hierarchical expand, time filter, and
 * boolean toggles. Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Voltfang ▼   ITBA ▶   Side Projects   Personal   📅Today     │
 *   │   Voltfang ▸ Minimum  Sonstige                                │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Main row: only top-level chips (with ▶ chevron when they have
 * children). Expanded sub-tags render in their OWN row below the main
 * one, prefixed with the parent name. This keeps the main row from
 * shifting other chips around when something gets expanded — the bug
 * the previous nested-column layout had.
 *
 * `selectedTagIds` is positive selection: empty = show all tasks;
 * non-empty = show only tasks with at least one of those tags. Filtering
 * by a parent matches any descendant.
 */
export function FilterStrip({
  tags,
  filters,
  onChange,
  taskCounts,
}: {
  tags: Tag[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
  taskCounts: Map<string, number>;
}) {
  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    tags.forEach((t) => m.set(t.id, t));
    return m;
  }, [tags]);
  const tree = useMemo(() => buildTagTree(tags), [tags]);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(filters.expandedTagIds),
  );

  const toggleSel = (id: string) => {
    const sel = new Set(filters.selectedTagIds);
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    onChange({ ...filters, selectedTagIds: [...sel] });
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
    onChange({ ...filters, expandedTagIds: [...next] });
  };

  const hasFilters =
    filters.selectedTagIds.length > 0 ||
    filters.deadlineFilter !== "any" ||
    !filters.showCompleted;

  // Flatten the tree into the list of "expanded sections" — one per
  // expanded node that has children. Depth-first so a sub-tag's substrip
  // (if also expanded) appears below its parent's substrip.
  const expandedSections = useMemo(() => {
    const out: TagNode[] = [];
    const walk = (nodes: TagNode[]) => {
      for (const n of nodes) {
        if (expanded.has(n.id) && n.children.length > 0) {
          out.push(n);
          walk(n.children);
        }
      }
    };
    walk(tree);
    return out;
  }, [tree, expanded]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* ── Main row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tree.map((node) => (
          <TagChip
            key={node.id}
            node={node}
            tagsById={tagsById}
            selected={filters.selectedTagIds}
            expanded={expanded}
            counts={taskCounts}
            onToggleSel={toggleSel}
            onToggleExpand={toggleExpand}
          />
        ))}

        <DeadlineFilterPill
          value={filters.deadlineFilter}
          onChange={(deadlineFilter) => onChange({ ...filters, deadlineFilter })}
        />

        <Toggle
          on={filters.showCompleted}
          onClick={() => onChange({ ...filters, showCompleted: !filters.showCompleted })}
          label="Show completed"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() =>
              onChange({
                selectedTagIds: [],
                expandedTagIds: filters.expandedTagIds,
                showCompleted: true,
                deadlineFilter: "any",
              })
            }
            className="border-border bg-surface hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
          >
            <X size={11} />
            Clear filters
          </button>
        )}
      </div>

      {/* ── Sub-strips below — one per expanded parent ────────────────── */}
      {expandedSections.map((node) => (
        <div
          key={node.id}
          className="border-border-strong ml-2 flex flex-wrap items-center gap-1.5 border-l-2 pl-3"
        >
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] italic">
            {node.name}
            <ChevronRight size={11} />
          </span>
          {node.children.map((child) => (
            <TagChip
              key={child.id}
              node={child}
              tagsById={tagsById}
              selected={filters.selectedTagIds}
              expanded={expanded}
              counts={taskCounts}
              onToggleSel={toggleSel}
              onToggleExpand={toggleExpand}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * One tag chip. Renders the colored dot + name + count, plus an optional
 * chevron-toggle when it has children. The chevron rotates 90° when
 * expanded and cues the substrip below.
 */
function TagChip({
  node,
  tagsById,
  selected,
  expanded,
  counts,
  onToggleSel,
  onToggleExpand,
}: {
  node: TagNode;
  tagsById: Map<string, Tag>;
  selected: string[];
  expanded: Set<string>;
  counts: Map<string, number>;
  onToggleSel: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const color = effectiveTagColor(node, tagsById);
  const isSelected = selected.includes(node.id);
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onToggleSel(node.id)}
        aria-pressed={isSelected}
        className={cn(
          "border-border bg-surface hover:bg-muted inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] transition-colors",
          isSelected && "border-foreground bg-foreground/10",
        )}
      >
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-black/10"
          style={{ background: color }}
        />
        {node.name}
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px]">
          {counts.get(node.id) ?? 0}
        </span>
      </button>
      {hasChildren && (
        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          aria-expanded={isExpanded}
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-5 w-5 items-center justify-center rounded transition-transform",
            isExpanded && "rotate-90",
          )}
        >
          <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function DeadlineFilterPill({
  value,
  onChange,
}: {
  value: DeadlineFilter;
  onChange: (next: DeadlineFilter) => void;
}) {
  const active = value !== "any";
  const options: DeadlineFilter[] = [
    "any",
    "overdue",
    "today",
    "next_3_days",
    "next_7_days",
    "next_14_days",
    "this_month",
    "has_deadline",
    "no_deadline",
  ];
  return (
    <label
      className={cn(
        "border-border bg-surface hover:bg-muted relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-2 text-[11.5px] transition-colors",
        active && "border-foreground bg-foreground/10",
      )}
    >
      <CalendarRange size={11} />
      <span>{DEADLINE_FILTER_LABELS[value]}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DeadlineFilter)}
        aria-label="Deadline filter"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {DEADLINE_FILTER_LABELS[opt]}
          </option>
        ))}
      </select>
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * Track-and-dot toggle. Position the dot via inline `left:` so the
 * rendered position is unambiguous regardless of any Tailwind 4
 * @theme regeneration. `bg-slate-300` for off (concrete color) avoids
 * any custom-token shape issues.
 */
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "border-border bg-surface hover:bg-muted inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
        on && "border-foreground/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block flex-shrink-0 rounded-full transition-colors",
          on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600",
        )}
        style={{ width: 26, height: 14 }}
      >
        <span
          className="absolute h-2.5 w-2.5 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ top: 2, left: on ? 13 : 3 }}
        />
      </span>
      {label}
    </button>
  );
}
