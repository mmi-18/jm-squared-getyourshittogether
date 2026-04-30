/// <reference lib="webworker" />
/**
 * Serwist service worker source.
 *
 * Compiled to /public/sw.js by `@serwist/next` at `next build` time. Keep
 * this file lean — it runs in the SW context, not the app, and any imports
 * become part of the SW bundle.
 *
 * Strategy:
 * - Precache the app shell (HTML, JS, CSS, fonts) — cache-first so the UI
 *   loads instantly offline. This is what makes the PWA feel native.
 * - Don't cache API/fetch calls in the SW. Data sync is handled separately
 *   by the IndexedDB-backed sync engine in `src/lib/sync.ts` (Phase 1B).
 *
 * Auto-update: the SW takes control on first install, then quietly updates
 * in the background. We don't prompt — the next route change picks up the
 * new bundle.
 *
 * Note: the triple-slash above pulls the WebWorker DOM types in for this
 * file only — TS' default `lib` is DOM, which doesn't know about
 * ServiceWorkerGlobalScope.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
