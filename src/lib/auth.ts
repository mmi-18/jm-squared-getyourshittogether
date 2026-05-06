/**
 * BetterAuth server-side instance + helpers.
 *
 * - Uses the Prisma adapter against our singleton Prisma client.
 * - Email + password only; email verification disabled.
 * - Single-user lockdown: after Mario signs up, flip `signUp.enabled = false`
 *   in this file and redeploy. The schema permits multiple users, but the
 *   v1 product is a personal task manager.
 * - `additionalFields` extends BetterAuth's User model with the domain
 *   fields (theme, timezone, defaultFilters, lastSyncAt) so settings live
 *   on the User row instead of needing a parallel profile table.
 * - `databaseHooks.user.create.after` seeds the three starter tags
 *   ("Work", "Personal", "Side Projects") so new accounts aren't empty.
 * - `nextCookies()` plugin lets server actions set/clear auth cookies (so
 *   signUp / signIn from a `"use server"` action work as expected).
 *
 * The matching client-side helpers live in `src/lib/auth-client.ts`.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
  },

  // Domain fields stored on the User row. BetterAuth surfaces them on the
  // session user object and lets signup pass them through.
  user: {
    additionalFields: {
      theme: {
        type: "string", // "light" | "dark" | "system"
        defaultValue: "dark",
        input: false,
      },
      timezone: {
        type: "string",
        defaultValue: "UTC",
        input: true, // browser stamps Intl.DateTimeFormat().resolvedOptions().timeZone at signup
      },
      defaultFilters: {
        type: "string", // serialized JSON; Prisma column is Json
        defaultValue: "{}",
        input: false,
      },
    },
  },

  // Seed the 3 starter tags + initialize the user's filter state on signup.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db.tag.createMany({
            data: [
              { userId: user.id, name: "Work",          color: "#3b82f6", sortOrder: 0 },
              { userId: user.id, name: "Personal",      color: "#f59e0b", sortOrder: 1 },
              { userId: user.id, name: "Side Projects", color: "#10b981", sortOrder: 2 },
            ],
          });
        },
      },
    },
  },

  session: {
    // 30 days. BetterAuth refreshes the session token in-place when it gets
    // close to expiry, so users stay logged in indefinitely while active.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24, // refresh token if older than 1 day
  },

  // MUST be the last plugin so it runs after all others.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

/**
 * Current authenticated user (BetterAuth core + domain additionalFields)
 * or null if signed out. Use in server components / actions / route handlers.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Like getCurrentUser, but throws if signed out — call from places that
 * already enforce authentication (e.g. inside protected layouts that have
 * already redirected to /login when null).
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
