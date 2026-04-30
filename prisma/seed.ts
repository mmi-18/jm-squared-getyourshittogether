/**
 * Database seed.
 *
 * Run with: `npm run seed`
 *
 * No global reference data to seed — per-user defaults (3 starter tags:
 * "Work", "Personal", "Side Projects") are created by a BetterAuth
 * `databaseHooks.user.create.after` hook in `src/lib/auth.ts`. That keeps
 * seeding scoped to the new user instead of touching shared state.
 *
 * This file exists so the build pipeline has a stable `npm run seed` target
 * and so future reference tables (e.g. an icon palette, a holiday calendar)
 * have an obvious home.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // No global rows to seed yet.
  console.log("Nothing to seed (per-user defaults are handled in auth hooks).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
