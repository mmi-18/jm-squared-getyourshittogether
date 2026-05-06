"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "./DatePicker";

/**
 * Date-range picker for the Upcoming view. Two dates (from / to) plus
 * three quick presets ("Next 7d / 14d / 30d"). State is persisted in
 * localStorage by MatrixClient so a refresh keeps the same window.
 *
 * Constraints:
 *   - `from` and `to` are ISO dates ("YYYY-MM-DD"); never null in this
 *     component (Upcoming view always shows a range).
 *   - When the user picks a `from` later than `to` (or vice versa), we
 *     swap them server-side in the filter logic so the list still
 *     renders.
 */
export function UpcomingRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  const setPreset = (days: number) => {
    const today = isoDate(0);
    const end = isoDate(days);
    onChange({ from: today, to: end });
  };

  return (
    <div className="bg-surface border-border flex flex-shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        From
      </span>
      <div className="min-w-[140px]">
        <DatePicker value={from} onChange={(v) => onChange({ from: v ?? from, to })} />
      </div>
      <ArrowRight size={13} className="text-muted-foreground" />
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        To
      </span>
      <div className="min-w-[140px]">
        <DatePicker value={to} onChange={(v) => onChange({ from, to: v ?? to })} />
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <PresetChip onClick={() => setPreset(7)}>Next 7d</PresetChip>
        <PresetChip onClick={() => setPreset(14)}>Next 14d</PresetChip>
        <PresetChip onClick={() => setPreset(30)}>Next 30d</PresetChip>
      </div>
    </div>
  );
}

function PresetChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border bg-surface hover:bg-muted inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px]",
      )}
    >
      {children}
    </button>
  );
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
