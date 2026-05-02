"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { importFromArtifact } from "../_actions/import";

/**
 * Phase 1B-γ-1 import flow rewritten for clarity (the v1 was a silent UI
 * — file pick set state with no visible feedback, which read as
 * "nothing happens when I pick the file"). New version:
 *
 *   1. User picks a file (or drops or pastes JSON).
 *   2. We immediately show a parsed preview: filename + counts of
 *      tasks / tags / nested subtasks. If the JSON is malformed, the
 *      error appears here, not silently after submit.
 *   3. The Import CTA below is sticky-visible with the impact
 *      ("Import 47 tasks and 8 tags") so the user can't miss it.
 */

type Preview =
  | { ok: true; tasks: number; tags: number; subtasks: number; filename: string | null }
  | { ok: false; error: string };

export function ImportClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [json, setJson] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [replace, setReplace] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { tagsImported: number; tasksImported: number } | null
  >(null);

  const onFile = async (file: File) => {
    setServerError(null);
    setResult(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      setJson(text);
    } catch (e) {
      setServerError(`Could not read file: ${e instanceof Error ? e.message : String(e)}`);
      setJson("");
    }
  };

  // Parse-on-render so we can display a live preview as the user types or
  // picks a different file. Cheap — these JSONs are small (KB range).
  const preview: Preview | null = json.trim()
    ? buildPreview(json, filename)
    : null;

  const submit = () => {
    setServerError(null);
    setResult(null);
    if (!json.trim()) {
      setServerError("Drop a tasks.json file or paste the JSON below first.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await importFromArtifact({ json, replace });
        setResult(r);
        setTimeout(() => router.push("/matrix"), 1200);
      } catch (e) {
        setServerError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ─── File picker / drop zone ───────────────────────────────────── */}
      <label
        className="border-border-strong hover:bg-muted relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white py-10 text-center transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <Upload size={20} className="text-muted-foreground" />
        <span className="text-sm">
          {filename ? (
            <>
              <strong className="font-medium">{filename}</strong> loaded —
              click again to choose a different file
            </>
          ) : (
            <>Drop <code>tasks.json</code> here, or click to browse</>
          )}
        </span>
        <input
          type="file"
          accept="application/json,.json,text/plain"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>

      {/* ─── Parsed preview / parse error ─────────────────────────────── */}
      {preview && (
        preview.ok ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <FileJson size={18} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                Found {preview.tasks} top-level task
                {preview.tasks === 1 ? "" : "s"}
                {preview.subtasks > 0 ? ` (+${preview.subtasks} subtasks)` : ""}
                {" "}and {preview.tags} tag{preview.tags === 1 ? "" : "s"}.
              </p>
              <p className="text-xs text-emerald-800/80 mt-0.5">
                Click <em>Import</em> below to migrate them into your account.
              </p>
            </div>
          </div>
        ) : (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <p className="font-medium">Couldn&apos;t parse the file as JSON.</p>
            <p className="text-xs mt-0.5">{preview.error}</p>
            <p className="text-xs mt-1">
              Tip: make sure you exported via the artifact&apos;s &ldquo;Export&rdquo;
              button (which produces <code>{`{"tasks":[…],"tags":[…]}`}</code>),
              not a screenshot or partial copy.
            </p>
          </div>
        )
      )}

      {/* ─── Paste fallback ──────────────────────────────────────────── */}
      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">…or paste the JSON manually</summary>
        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setFilename(null);
          }}
          rows={10}
          placeholder='{"tasks":[…],"tags":[…]}'
          className="border-border focus:border-foreground mt-2 w-full rounded-md border bg-white p-3 font-mono text-xs outline-none"
        />
      </details>

      {/* ─── Replace checkbox ────────────────────────────────────────── */}
      <label className="border-border bg-muted/40 flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Replace existing data</span>
          <span className="text-muted-foreground block text-xs">
            Wipes the 3 starter tags + any tasks you&apos;ve created here so far,
            then imports cleanly. Recommended if this is your first import.
          </span>
        </span>
      </label>

      {/* ─── Server error / success ──────────────────────────────────── */}
      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {serverError}
        </div>
      )}
      {result && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          <CheckCircle2 size={14} />
          Imported {result.tagsImported} tags and {result.tasksImported} tasks.
          Redirecting to matrix…
        </div>
      )}

      {/* ─── Big Import CTA ──────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !preview || (preview && !preview.ok)}
          className="bg-foreground text-background inline-flex h-11 items-center gap-2 rounded-md px-6 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Importing…"
            : preview && preview.ok
              ? `Import ${preview.tasks + preview.subtasks} task${preview.tasks + preview.subtasks === 1 ? "" : "s"}`
              : "Import"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * Parse the candidate JSON, count what's in it. Recursive subtask count
 * matches what `_actions/import.ts` actually creates (so the preview
 * doesn't lie about scale).
 */
function buildPreview(json: string, filename: string | null): Preview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Top-level value must be an object." };
  }
  const r = parsed as Record<string, unknown>;
  const tasksRaw = Array.isArray(r.tasks) ? (r.tasks as unknown[]) : [];
  const tagsRaw = Array.isArray(r.tags) ? (r.tags as unknown[]) : [];
  if (tasksRaw.length === 0 && tagsRaw.length === 0) {
    return {
      ok: false,
      error: 'Expected `{ "tasks": [...], "tags": [...] }`. Both arrays are empty or missing.',
    };
  }

  const countTopLevel = tasksRaw.filter(
    (t) => t && typeof t === "object" && typeof (t as { title?: unknown }).title === "string",
  ).length;

  const countSubtasks = (arr: unknown[]): number => {
    let n = 0;
    for (const t of arr) {
      if (!t || typeof t !== "object") continue;
      const sub = (t as { subtasks?: unknown }).subtasks;
      if (Array.isArray(sub)) {
        n += sub.filter(
          (s) => s && typeof s === "object" && typeof (s as { title?: unknown }).title === "string",
        ).length;
        n += countSubtasks(sub);
      }
    }
    return n;
  };

  return {
    ok: true,
    tasks: countTopLevel,
    tags: tagsRaw.length,
    subtasks: countSubtasks(tasksRaw),
    filename,
  };
}
