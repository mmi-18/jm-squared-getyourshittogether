"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronRight, X } from "lucide-react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DEADLINE_FILTER_LABELS, effectiveTagColor } from "@/lib/quadrant-utils";
import { buildTagTree, type TagNode } from "@/lib/tag-utils";
import type { DeadlineFilter, FilterState } from "@/lib/types";

/**
 * Filter strip — tag chips with hierarchical expand, "show completed" and
 * "only with deadline" toggles, "clear filters" affordance.
 *
 * `selectedTagIds` is *positive* selection: tasks with at least one of these
 * tags pass. (Note: the artifact's filter is "filteredOut" — tags get
 * struck-through when *deselected*. We use positive semantics: empty
 * selection means "show all", non-empty means "show only tasks tagged
 * with at least one of these".)
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tree.map((node) => (
        <TagChipWithSubs
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
        onChange={(deadlineFilter) =>
          onChange({ ...filters, deadlineFilter })
        }
      />

      <Toggle
        on={filters.showCompleted}
        onClick={() =>
          onChange({ ...filters, showCompleted: !filters.showCompleted })
        }
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
          className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px]"
        >
          <X size={11} />
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * The deadline-filter dropdown. Renders as a pill (matches the rest of the
 * filter strip aesthetic). Inactive when value="any"; highlighted when
 * any other preset is selected.
 *
 * Uses a native <select> wrapped in a styled <span> so we get the OS
 * picker on mobile (better tap experience than a custom popover) without
 * sacrificing visual consistency on desktop.
 */
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
        "border-border hover:bg-muted relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-white py-0.5 pl-2 pr-2 text-[11.5px] transition-colors",
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

function TagChipWithSubs({
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
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleSel(node.id)}
          className={cn(
            "border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[12px] transition-colors",
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
            className={cn(
              "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-5 w-5 items-center justify-center rounded transition-transform",
              isExpanded && "rotate-90",
            )}
          >
            <ChevronRight size={11} />
          </button>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div
          className="bg-muted/50 border-border ml-2 flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1"
          style={{ animation: "em-fade-in 180ms ease-out" }}
        >
          {node.children.map((child) => (
            <TagChipWithSubs
              key={child.id}
              node={child}
              tagsById={tagsById}
              selected={selected}
              expanded={expanded}
              counts={counts}
              onToggleSel={onToggleSel}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
      className={cn(
        "border-border hover:bg-muted inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-0.5 text-[11.5px]",
        on && "border-foreground bg-foreground/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-3 w-6 flex-shrink-0 rounded-full transition-colors",
          on ? "bg-emerald-500" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-2 w-2 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-3" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}
