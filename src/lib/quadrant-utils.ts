/**
 * UI helpers for quadrant + tag color rendering. Pure functions — no DB
 * access, importable from server or client components.
 */

import type { Tag } from "@prisma/client";
import type { Quadrant } from "@/lib/types";

export const QUADRANT_ACCENT: Record<Quadrant, string> = {
  1: "var(--q1-accent)",
  2: "var(--q2-accent)",
  3: "var(--q3-accent)",
  4: "var(--q4-accent)",
};

/**
 * Walks up the parent chain to find the first tag with `inheritColor=false`,
 * returning its color. If no such ancestor is found (shouldn't happen — the
 * `reconcileTagParents` invariant ensures roots have inheritColor=false), we
 * fall back to the tag's own color.
 *
 *   const effective = effectiveTagColor(tag, allTagsById);
 */
export function effectiveTagColor(
  tag: Tag,
  byId: Map<string, Tag>,
  seen: Set<string> = new Set(),
): string {
  if (!tag.inheritColor || !tag.parentId) return tag.color;
  if (seen.has(tag.id)) return tag.color; // cycle guard
  seen.add(tag.id);
  const parent = byId.get(tag.parentId);
  if (!parent) return tag.color;
  return effectiveTagColor(parent, byId, seen);
}

/**
 * Build a CSS gradient for a task card's background tint, given the
 * effective colors of its tags. Higher alphas than the spec called for
 * (0.35/0.10 vs 0.22/0.06) — the lower numbers read as "barely tinted"
 * on the violet-50 bg.
 *
 *  - 0 tags → transparent (caller renders surface color)
 *  - 1 tag  → diagonal gradient from rgba(c, 0.35) to rgba(c, 0.10)
 *  - 2+     → multi-stop diagonal blend at 0.30 alpha each
 */
export function buildTaskTint(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) {
    return `linear-gradient(135deg, ${hexToRgba(colors[0], 0.35)}, ${hexToRgba(colors[0], 0.10)})`;
  }
  const stops = colors
    .map((c, i) => {
      const pct = Math.round((i / (colors.length - 1)) * 100);
      return `${hexToRgba(c, 0.30)} ${pct}%`;
    })
    .join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

/**
 * Vertical bar at the left edge of a task card. Single color → solid;
 * multi → vertical gradient top-to-bottom across all tag colors.
 */
export function buildTaskBar(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) return colors[0];
  const stops = colors
    .map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`)
    .join(", ");
  return `linear-gradient(180deg, ${stops})`;
}

/**
 * Convert a #rrggbb color to rgba(r, g, b, alpha). Tolerates short #rgb form.
 */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Apply a `DeadlineFilter` preset. `null` deadlines pass only the "any"
 * (no filter) and "no_deadline" presets. Day-comparison: floor both sides
 * to local midnight so "today" matches a same-day deadline regardless of
 * the time component.
 */
import type { DeadlineFilter } from "@/lib/types";

export function passesDeadlineFilter(
  deadline: Date | string | null,
  filter: DeadlineFilter,
): boolean {
  if (filter === "any") return true;
  if (filter === "no_deadline") return deadline === null;
  if (deadline === null) return false; // all remaining filters require a deadline
  if (filter === "has_deadline") return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = typeof deadline === "string" ? new Date(deadline) : new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);

  switch (filter) {
    case "overdue":      return diff < 0;
    case "today":        return diff === 0;
    case "next_3_days":  return diff >= 0 && diff <= 2;
    case "next_7_days":  return diff >= 0 && diff <= 6;
    case "next_14_days": return diff >= 0 && diff <= 13;
    case "this_month":
      return (
        dl.getFullYear() === today.getFullYear() &&
        dl.getMonth() === today.getMonth()
      );
  }
  return true;
}

export const DEADLINE_FILTER_LABELS: Record<DeadlineFilter, string> = {
  any: "Any time",
  has_deadline: "Has deadline",
  no_deadline: "No deadline",
  overdue: "Overdue",
  today: "Today",
  next_3_days: "Next 3 days",
  next_7_days: "Next 7 days",
  next_14_days: "Next 14 days",
  this_month: "This month",
};

/**
 * Format a date for the deadline pill on a task card. Mirrors the artifact:
 * relative-when-near, "MMM d" otherwise. Returns the string + a tone hint.
 */
export function formatDeadline(
  deadline: Date | string,
): { label: string; tone: "default" | "soon" | "overdue" } {
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  // Strip time so "today" matches a same-day deadline regardless of clock.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Tomorrow";
  else if (diffDays === -1) label = "Yesterday";
  else if (diffDays > 1 && diffDays <= 7) label = `In ${diffDays}d`;
  else if (diffDays < -1 && diffDays >= -7) label = `${Math.abs(diffDays)}d ago`;
  else
    label = due.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: due.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });

  let tone: "default" | "soon" | "overdue" = "default";
  if (diffDays < 0) tone = "overdue";
  else if (diffDays <= 2) tone = "soon";

  return { label, tone };
}
