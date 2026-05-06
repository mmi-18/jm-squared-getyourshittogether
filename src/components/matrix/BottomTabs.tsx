"use client";

import { CalendarDays, CalendarRange, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export type View = "matrix" | "today" | "upcoming";

/**
 * Bottom tab bar — primary view switcher between the matrix board and
 * the date-focused list views (Today / Upcoming). Iconic, always-visible,
 * full-width on mobile + desktop. Respects iOS home-indicator safe area.
 */
export function BottomTabs({
  view,
  onChangeView,
}: {
  view: View;
  onChangeView: (next: View) => void;
}) {
  return (
    <nav
      className="bg-surface border-border flex flex-shrink-0 border-t"
      aria-label="View"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <Tab
        icon={<LayoutGrid size={17} />}
        label="Matrix"
        active={view === "matrix"}
        onClick={() => onChangeView("matrix")}
      />
      <Tab
        icon={<CalendarDays size={17} />}
        label="Today"
        active={view === "today"}
        onClick={() => onChangeView("today")}
      />
      <Tab
        icon={<CalendarRange size={17} />}
        label="Upcoming"
        active={view === "upcoming"}
        onClick={() => onChangeView("upcoming")}
      />
    </nav>
  );
}

function Tab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium uppercase tracking-wider transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
