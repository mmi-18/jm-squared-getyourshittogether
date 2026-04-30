/**
 * Prisma Client singleton.
 *
 * In dev (Next.js HMR), every save would otherwise spawn a fresh PrismaClient
 * and quickly exhaust connection slots. Stash the instance on `globalThis`
 * so subsequent module reloads reuse it.
 *
 * Use this everywhere instead of `new PrismaClient()` directly:
 *
 *   import { db } from "@/lib/db";
 *   const tasks = await db.task.findMany({ where: { userId } });
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
