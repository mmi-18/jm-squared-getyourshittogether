import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes Get Your Shit Together installable as a PWA.
 *
 * Once installed (Add to Home Screen on mobile, Install App on desktop),
 * the app launches in standalone mode with no browser chrome — feels native
 * and lets us hide the URL bar so the matrix uses the full viewport.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Get Your Shit Together",
    short_name: "GYST",
    description:
      "Personal task manager built around the Eisenhower Matrix. Urgent × Important, drag-and-drop, tagged, offline-first.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#0f172a",
    categories: ["productivity", "lifestyle"],
    icons: [
      // Routes auto-served by `src/app/icon.tsx` + `src/app/apple-icon.tsx`.
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
