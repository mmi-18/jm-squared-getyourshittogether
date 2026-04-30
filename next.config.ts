import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Generates /public/sw.js (the precaching service worker) at `next build`
// time from the worker source at `src/app/sw.ts`. Disabled in dev so HMR
// isn't fighting a cached app shell.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Note: we do NOT use `output: "standalone"`. The Dockerfile ships the
  // full node_modules so the Prisma CLI works at container start for
  // `prisma migrate deploy`. Same trade-off as glimpse.
};

export default withSerwist(nextConfig);
