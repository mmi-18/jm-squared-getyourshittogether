"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom date picker — portaled to <body>, positioned via getBoundingClientRect.
 *
 * Why portal: the picker is opened from inside scrollable quadrant bodies
 * with `overflow: hidden`. Anchoring it to a parent stack would clip it.
 * Spec lesson #3 from the artifact prototype.
 *
 * Three views: days (default), months, years. The header label is
 * clickable to step UP a level (days → months → years), and selecting an
 * item drills DOWN. The Today / Tomorrow / +1 week shortcuts live below
 * the days grid.
 */
type Mode = "days" | "months" | "years";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DOW_MON_FIRST = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // Callback-ref pattern: React 19 lints against reading ref.current during
  // render. Storing the DOM node in state lets us pass it to the popup
  // (which needs it to compute position) without that pitfall.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  // Close on outside click. Scoped tightly so it doesn't fight other popups.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerEl?.contains(t)) return;
      if (popupEl?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open, triggerEl, popupEl]);

  const formatted = useMemo(() => {
    if (!value) return placeholder;
    const d = fromIsoDate(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  }, [value, placeholder]);

  return (
    <>
      <button
        ref={setTriggerEl}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "border-border hover:bg-muted inline-flex w-full items-center gap-2 rounded-md border bg-surface px-2.5 py-1.5 text-left text-[12.5px]",
          !value && "text-muted-foreground",
        )}
      >
        <Calendar size={13} />
        <span className="flex-1 truncate">{formatted}</span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            aria-label="Clear date"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </button>

      {open && triggerEl && (
        <DatePickerPopup
          setRef={setPopupEl}
          anchor={triggerEl}
          value={value}
          onSelect={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════

const DatePickerPopup = function DatePickerPopup({
  setRef,
  anchor,
  value,
  onSelect,
  onClose,
}: {
  setRef: (el: HTMLDivElement | null) => void;
  anchor: HTMLElement;
  value: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("days");
  const initial = value ? fromIsoDate(value) : new Date();
  const [view, setView] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the popup. Try below; flip above if there's no room. Resize
  // / scroll re-anchors it.
  useEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const POPUP_H = 320;
      const POPUP_W = 280;
      const spaceBelow = window.innerHeight - r.bottom;
      const top =
        spaceBelow >= POPUP_H + 8 ? r.bottom + 4 : Math.max(8, r.top - POPUP_H - 4);
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - POPUP_W - 8,
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={setRef}
      role="dialog"
      aria-label="Choose date"
      style={{ top: pos.top, left: pos.left, width: 280 }}
      className="border-border bg-surface fixed z-50 rounded-[10px] border p-3 shadow-md"
    >
      {mode === "days" && (
        <DaysView
          year={view.year}
          month={view.month}
          selected={value}
          onPrev={() => {
            const m = view.month === 0 ? 11 : view.month - 1;
            const y = view.month === 0 ? view.year - 1 : view.year;
            setView({ year: y, month: m });
          }}
          onNext={() => {
            const m = view.month === 11 ? 0 : view.month + 1;
            const y = view.month === 11 ? view.year + 1 : view.year;
            setView({ year: y, month: m });
          }}
          onLabel={() => setMode("months")}
          onPick={(d) => onSelect(toIsoDate(d))}
          onClear={() => onClose()}
          onShortcut={(offset) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            onSelect(toIsoDate(d));
          }}
        />
      )}

      {mode === "months" && (
        <MonthsView
          year={view.year}
          onPrevYear={() => setView({ year: view.year - 1, month: view.month })}
          onNextYear={() => setView({ year: view.year + 1, month: view.month })}
          onLabel={() => setMode("years")}
          onPick={(m) => {
            setView({ year: view.year, month: m });
            setMode("days");
          }}
        />
      )}

      {mode === "years" && (
        <YearsView
          year={view.year}
          onShift={(delta) => setView({ year: view.year + delta, month: view.month })}
          onPick={(y) => {
            setView({ year: y, month: view.month });
            setMode("months");
          }}
        />
      )}
    </div>,
    document.body,
  );
};

// ── Sub-views ──────────────────────────────────────────────────────────────

function DaysView({
  year,
  month,
  selected,
  onPrev,
  onNext,
  onLabel,
  onPick,
  onClear,
  onShortcut,
}: {
  year: number;
  month: number;
  selected: string | null;
  onPrev: () => void;
  onNext: () => void;
  onLabel: () => void;
  onPick: (d: Date) => void;
  onClear: () => void;
  onShortcut: (offset: number) => void;
}) {
  // Build a 7-col grid starting Monday. Each cell is a Date with a "this month"
  // boolean for dimming.
  const cells: { d: Date; thisMonth: boolean }[] = [];
  const first = new Date(year, month, 1);
  // JS getDay(): 0=Sun..6=Sat. We want Mo=0..Su=6.
  const offsetMonStart = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offsetMonStart);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ d, thisMonth: d.getMonth() === month });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selDate = selected ? fromIsoDate(selected) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12.5px]">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={onLabel}
          className="hover:bg-muted rounded px-2 py-0.5 font-medium"
        >
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next month"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[10.5px]">
        {DOW_MON_FIRST.map((d) => (
          <div key={d} className="text-muted-foreground py-1">
            {d}
          </div>
        ))}
        {cells.map(({ d, thisMonth }, i) => {
          const isToday = d.getTime() === today.getTime();
          const isSel = selDate && d.getTime() === selDate.getTime();
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                "h-7 rounded text-[12px] transition-colors",
                !thisMonth && "text-subtle",
                isToday && !isSel && "ring-1 ring-[var(--accent)]",
                isSel
                  ? "bg-foreground text-background font-semibold"
                  : "hover:bg-muted",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="border-border flex items-center justify-between gap-1 border-t pt-2 text-[11.5px]">
        <button
          type="button"
          onClick={() => onShortcut(0)}
          className="hover:bg-muted rounded px-2 py-1"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onShortcut(1)}
          className="hover:bg-muted rounded px-2 py-1"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => onShortcut(7)}
          className="hover:bg-muted rounded px-2 py-1"
        >
          +1 week
        </button>
        {selected && (
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto rounded px-2 py-1"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function MonthsView({
  year,
  onPrevYear,
  onNextYear,
  onLabel,
  onPick,
}: {
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  onLabel: () => void;
  onPick: (m: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12.5px]">
        <button
          type="button"
          onClick={onPrevYear}
          aria-label="Previous year"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={onLabel}
          className="hover:bg-muted rounded px-2 py-0.5 font-medium"
        >
          {year}
        </button>
        <button
          type="button"
          onClick={onNextYear}
          aria-label="Next year"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTHS_SHORT.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onPick(i)}
            className="hover:bg-muted rounded py-2 text-[12px]"
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function YearsView({
  year,
  onShift,
  onPick,
}: {
  year: number;
  onShift: (delta: number) => void;
  onPick: (y: number) => void;
}) {
  // Show a 12-year window starting at year - (year % 12).
  const start = year - (year % 12);
  const years = Array.from({ length: 12 }, (_, i) => start + i);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12.5px]">
        <button
          type="button"
          onClick={() => onShift(-12)}
          aria-label="Earlier years"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-2 py-0.5 font-medium">
          {years[0]}–{years[years.length - 1]}
        </span>
        <button
          type="button"
          onClick={() => onShift(12)}
          aria-label="Later years"
          className="hover:bg-muted rounded p-1"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => onPick(y)}
            className="hover:bg-muted rounded py-2 text-[12px]"
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}
