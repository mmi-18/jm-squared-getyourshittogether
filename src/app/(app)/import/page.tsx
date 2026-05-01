import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportClient } from "./ImportClient";

/**
 * One-time importer for data exported from the Eisenhower-matrix Claude
 * artifact (the single-file HTML prototype). Spec:
 *
 *   - Open the artifact in your browser (the same one whose localStorage /
 *     OPFS holds your tasks)
 *   - Click "Export" — that downloads a `tasks.json` file
 *   - Drop the file (or paste its contents) into the textarea on this page
 *   - Tick "Replace existing data" if you've already started entering
 *     tasks here that you want to discard
 *
 * The mapping is implemented in `_actions/import.ts`. This page is a thin
 * UI wrapper.
 */
export default function ImportPage() {
  return (
    <main className="bg-background flex min-h-screen flex-col">
      <header className="bg-surface border-border flex flex-shrink-0 items-center gap-3 border-b px-4 py-3">
        <Link
          href="/matrix"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft size={13} />
          Back to matrix
        </Link>
        <h1 className="text-[15px] font-semibold tracking-tight">
          Import from artifact
        </h1>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <p className="text-muted-foreground mb-6 text-sm">
          Migrate tasks and tags from the Claude artifact prototype. Click
          Export in the artifact to download a <code>tasks.json</code> file,
          then drop it below.
        </p>
        <ImportClient />
      </div>
    </main>
  );
}
