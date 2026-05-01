"use client";

import { useMemo, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, Trash2, X } from "lucide-react";
import type { Tag } from "@prisma/client";
import { cn } from "@/lib/utils";
import { effectiveTagColor } from "@/lib/quadrant-utils";
import { buildTagTree, flattenTree } from "@/lib/tag-utils";
import { createTag, updateTag, deleteTag } from "@/app/(app)/_actions/tags";
import { useRouter } from "next/navigation";

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#6366f1", "#f43f5e", "#6b7280",
];

export function TagManagerModal({
  open,
  onClose,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  tags: Tag[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [palette, setPalette] = useState<string | null>(null); // tagId whose palette is open

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    tags.forEach((t) => m.set(t.id, t));
    return m;
  }, [tags]);
  const flat = useMemo(() => flattenTree(buildTagTree(tags)), [tags]);

  // Local edit buffers, keyed by tag id, so renames don't fire a server
  // round-trip on every keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = () => router.refresh();

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Popup className="bg-surface border-border fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[min(540px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-md">
          <header className="border-border flex items-center gap-3 border-b px-4 py-3">
            <Dialog.Title className="flex-1 text-[14px] font-semibold tracking-tight">
              Manage tags
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            >
              <X size={16} />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {flat.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-[12.5px] italic">
                No tags yet.
              </p>
            )}
            {flat.map((node) => {
              const draftValue = drafts[node.id] ?? node.name;
              const eff = effectiveTagColor(node, tagsById);
              return (
                <div
                  key={node.id}
                  className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-1.5"
                  style={{ paddingLeft: 8 + node.depth * 18 }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setPalette((p) => (p === node.id ? null : node.id))
                    }
                    className="relative h-5 w-5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ background: eff }}
                    title={node.inheritColor ? "Inherits color" : node.color}
                  >
                    {node.inheritColor && (
                      <span className="absolute -right-0.5 -top-1.5 text-[10px] font-bold leading-none text-white drop-shadow">
                        ↑
                      </span>
                    )}
                  </button>

                  <input
                    type="text"
                    value={draftValue}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [node.id]: e.target.value }))
                    }
                    onBlur={() => {
                      const next = (drafts[node.id] ?? node.name).trim();
                      if (next === node.name || !next) {
                        setDrafts((d) => {
                          const c = { ...d };
                          delete c[node.id];
                          return c;
                        });
                        return;
                      }
                      startTransition(async () => {
                        await updateTag({ id: node.id, name: next });
                        setDrafts((d) => {
                          const c = { ...d };
                          delete c[node.id];
                          return c;
                        });
                        refresh();
                      });
                    }}
                    className="border-border focus:border-foreground flex-1 rounded border bg-white px-2 py-1 text-[12.5px] outline-none"
                  />

                  <select
                    value={node.parentId ?? ""}
                    disabled={pending}
                    onChange={(e) => {
                      const newParent = e.target.value || null;
                      startTransition(async () => {
                        await updateTag({ id: node.id, parentId: newParent });
                        refresh();
                      });
                    }}
                    className="border-border bg-surface rounded border px-1.5 py-1 text-[11px]"
                  >
                    <option value="">(root)</option>
                    {flat
                      .filter((t) => t.id !== node.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {"-".repeat(t.depth)} {t.name}
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    aria-label="Delete tag"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${node.name}"? Children will be reparented; tasks will lose this tag.`,
                        )
                      ) {
                        startTransition(async () => {
                          await deleteTag(node.id);
                          refresh();
                        });
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1"
                  >
                    <Trash2 size={13} />
                  </button>

                  {palette === node.id && (
                    <ColorPalette
                      current={node.color}
                      inheritColor={node.inheritColor}
                      hasParent={!!node.parentId}
                      onPick={(color) => {
                        setPalette(null);
                        startTransition(async () => {
                          await updateTag({ id: node.id, color, inheritColor: false });
                          refresh();
                        });
                      }}
                      onInheritToggle={(inherit) => {
                        setPalette(null);
                        startTransition(async () => {
                          await updateTag({ id: node.id, inheritColor: inherit });
                          refresh();
                        });
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <footer className="border-border flex items-center justify-between gap-2 border-t px-4 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await createTag({
                    name: "New tag",
                    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
                  });
                  refresh();
                });
              }}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-[12.5px]"
            >
              <Plus size={13} />
              Add tag
            </button>
            <Dialog.Close className="bg-foreground text-background hover:opacity-90 rounded-md px-3 py-1.5 text-[12.5px] font-medium">
              Done
            </Dialog.Close>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ColorPalette({
  current,
  inheritColor,
  hasParent,
  onPick,
  onInheritToggle,
}: {
  current: string;
  inheritColor: boolean;
  hasParent: boolean;
  onPick: (c: string) => void;
  onInheritToggle: (inherit: boolean) => void;
}) {
  return (
    <div className="border-border bg-surface absolute right-2 top-full z-10 mt-1 flex w-[220px] flex-col gap-2 rounded-md border p-2 shadow-md">
      <div className="grid grid-cols-5 gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className={cn(
              "h-7 rounded ring-1",
              c === current ? "ring-foreground" : "ring-black/10",
            )}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
      {hasParent && (
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={inheritColor}
            onChange={(e) => onInheritToggle(e.target.checked)}
          />
          Inherit color from parent
        </label>
      )}
    </div>
  );
}
