/**
 * BetterAuth catch-all route handler.
 *
 * BetterAuth registers all of its endpoints (sign-in, sign-up, sign-out,
 * session, verify, etc.) under a single Next route. The `toNextJsHandler`
 * helper adapts BetterAuth's request handler to Next 16's GET/POST exports.
 *
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/session
 *   ...
 */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
