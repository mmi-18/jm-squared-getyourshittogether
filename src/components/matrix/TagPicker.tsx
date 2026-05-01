"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Tags } from "lucide-react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { effectiveTagColor } from "@/lib/quadrant-utils";
import { buildTagTree, flattenTree } from "@/lib/tag-utils";

/**
 * Multi-select tag picker — opens as a portal'd popover beneath the trigger.
 * Renders tags in tree order with depth-indenting and the inheritance "↑"
 * badge on swatches that derive their color from a parent.
 */
export function TagPicker({
  value,
  onChange,
  tags,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  tags: Tag[];
}) {
  const [open, setOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const [popEl, setPopEl] = useState<HTMLDivElement | null>(null);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    tags.forEach((t) => m.set(t.id, t));
    return m;
  }, [tags]);

  const flat = useMemo(() => flattenTree(buildTagTree(tags)), [tags]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerEl?.contains(t)) return;
      if (popEl?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open, triggerEl, popEl]);

  const summary =
    value.length === 0
      ? "Add tags"
      : value.length === 1
        ? (tagsById.get(value[0])?.name ?? "1 tag")
        : `${value.length} tags`;

  return (
    <>
      <button
        ref={setTriggerEl}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "border-border hover:bg-muted inline-flex w-full items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-left text-[12.5px]",
          value.length === 0 && "text-muted-foreground",
        )}
      >
        <Tags size={13} />
        <span className="flex-1 truncate">{summary}</span>
      </button>

      {open && triggerEl && (
        <TagPickerPopup
          setRef={setPopEl}
          anchor={triggerEl}
          value={value}
          flat={flat}
          tagsById={tagsById}
          onToggle={(id) =>
            onChange(
              value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
            )
          }
        />
      )}
    </>
  );
}

const TagPickerPopup = function TagPickerPopup({
  setRef,
  anchor,
  value,
  flat,
  tagsById,
  onToggle,
}: {
  setRef: (el: HTMLDivElement | null) => void;
  anchor: HTMLElement;
  value: string[];
  flat: ReturnType<typeof flattenTree>;
  tagsById: Map<string, Tag>;
  onToggle: (id: string) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const POPUP_H = Math.min(320, flat.length * 30 + 16);
      const POPUP_W = Math.max(220, anchor.offsetWidth);
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
  }, [anchor, flat.length]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={setRef}
      role="listbox"
      aria-multiselectable="true"
      style={{ top: pos.top, left: pos.left, width: Math.max(220, anchor.offsetWidth) }}
      className="border-border bg-surface fixed z-50 max-h-[320px] overflow-y-auto rounded-[10px] border p-1 shadow-md"
    >
      {flat.length === 0 && (
        <p className="text-muted-foreground p-3 text-center text-[12px] italic">
          No tags yet — create some in &ldquo;Manage tags&rdquo;.
        </p>
      )}
      {flat.map((node) => {
        const selected = value.includes(node.id);
        const color = effectiveTagColor(node, tagsById);
        return (
          <button
            key={node.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onToggle(node.id)}
            className={cn(
              "hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px]",
              selected && "bg-muted",
            )}
            style={{ paddingLeft: 8 + node.depth * 14 }}
          >
            <span
              className="relative h-3 w-3 flex-shrink-0 rounded-full"
              style={{ background: color }}
              title={node.inheritColor ? "Inherits color from parent" : node.color}
            >
              {node.inheritColor && (
                <span className="absolute -right-0.5 -top-1 text-[8px] font-bold leading-none text-white drop-shadow">
                  ↑
                </span>
              )}
            </span>
            <span className="flex-1 truncate">{node.name}</span>
            {selected && (
              <span className="text-muted-foreground text-[10px]">✓</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
};
