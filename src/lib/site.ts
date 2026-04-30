/**
 * Resolve the canonical site URL. Used by `metadataBase`, og:image, the PWA
 * manifest, robots.txt, sitemap.xml, and anywhere else we need an absolute
 * URL.
 *
 * Order of precedence:
 *   1. NEXT_PUBLIC_SITE_URL  (set in .env on the host, baked at build time)
 *   2. http://localhost:3000  (dev fallback)
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}
