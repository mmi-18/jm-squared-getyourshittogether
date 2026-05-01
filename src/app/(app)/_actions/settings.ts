"use server";

/**
 * Server actions for User-row settings.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FilterState } from "@/lib/types";
import { Theme } from "@prisma/client";

const revalidate = () => revalidatePath("/matrix");

export async function updateUserTheme(theme: Theme) {
  const user = await requireUser();
  if (!Object.values(Theme).includes(theme)) throw new Error("Invalid theme");
  await db.user.update({ where: { id: user.id }, data: { theme } });
  revalidate();
}

/**
 * Persist filter state across devices. We don't validate strictly — the
 * shape may evolve and we treat the column as opaque JSON. Worst case, the
 * client falls back to the default filter state on parse failure.
 */
export async function updateUserFilters(filters: FilterState) {
  const user = await requireUser();
  await db.user.update({
    where: { id: user.id },
    data: { defaultFilters: filters as unknown as object },
  });
  revalidate();
}
