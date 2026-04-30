/**
 * BetterAuth client-side helpers.
 *
 * Use these in client components for sign-in / sign-up / sign-out / session
 * reads. The server-side instance (`@/lib/auth`) is a separate import — never
 * mix them; importing the server side from a client component pulls Prisma
 * into the bundle.
 *
 *   import { signIn, signOut, useSession } from "@/lib/auth-client";
 *
 *   const { data: session } = useSession();
 *   await signIn.email({ email, password });
 *   await signOut();
 */
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL,
  // Mirror the server's additionalFields so TS knows about theme, timezone,
  // etc. on session.user without a parallel type definition.
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
