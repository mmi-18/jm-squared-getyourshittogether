"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { importFromArtifact } from "../_actions/import";

export function ImportClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [json, setJson] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { tagsImported: number; tasksImported: number } | null
  >(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setJson(text);
    setError(null);
  };

  const submit = () => {
    setError(null);
    setResult(null);
    if (!json.trim()) {
      setError("Paste a JSON export, or drop a file above.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await importFromArtifact({ json, replace });
        setResult(r);
        // Redirect after a short pause so the user reads the success line.
        setTimeout(() => router.push("/matrix"), 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* File drop / picker */}
      <label
        className="border-border-strong hover:bg-muted flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <Upload size={20} className="text-muted-foreground" />
        <span className="text-sm">
          Drop <code>tasks.json</code> here, or click to browse
        </span>
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>

      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">…or paste the JSON</summary>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={10}
          placeholder='{"tasks":[…],"tags":[…]}'
          className="border-border focus:border-foreground mt-2 w-full rounded-md border bg-white p-3 font-mono text-xs outline-none"
        />
      </details>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        Replace existing data (deletes the 3 starter tags + any tasks created since signup)
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {result && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          Imported {result.tagsImported} tags and {result.tasksImported}{" "}
          tasks. Redirecting to matrix…
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-foreground text-background inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
