/**
 * Shared types — re-exports of Prisma-generated model types under stable
 * names so the rest of the app doesn't have to import from `@prisma/client`
 * everywhere, plus a few UI-only helpers.
 */

export type {
  User,
  Session,
  Account,
  Verification,
  Tag,
  Task,
  TaskTag,
  ScheduledTask,
} from "@prisma/client";

export { Theme } from "@prisma/client";

import type { Task as PrismaTask, Tag as PrismaTag } from "@prisma/client";

/**
 * The four Eisenhower quadrants as a const-asserted union, useful for
 * exhaustive switches in the UI.
 *
 *   1 = Urgent + Important       ("Do now")
 *   2 = Important, Not Urgent    ("Schedule — strategic work")
 *   3 = Urgent, Not Important    ("Delegate")
 *   4 = Not Urgent, Not Important ("Eliminate")
 */
export type Quadrant = 1 | 2 | 3 | 4;

export const QUADRANTS = {
  1: { roman: "I.", title: "Urgent & Important", subtitle: "Do now" },
  2: { roman: "II.", title: "Important, Not Urgent", subtitle: "Schedule — strategic work" },
  3: { roman: "III.", title: "Urgent, Not Important", subtitle: "Delegate" },
  4: { roman: "IV.", title: "Not Urgent, Not Important", subtitle: "Eliminate" },
} as const satisfies Record<Quadrant, { roman: string; title: string; subtitle: string }>;

/**
 * A Task with its tags and immediate children loaded — the shape expected
 * by Quadrant / TaskCard components.
 */
export type TaskWithRelations = PrismaTask & {
  tags: PrismaTag[];
  children?: TaskWithRelations[];
};

/**
 * Time-based deadline filter presets. Mutually exclusive — pick one.
 *
 *   any            no filter (default)
 *   has_deadline   any task that has a deadline
 *   no_deadline    only tasks without a deadline
 *   overdue        deadline strictly before today
 *   today          deadline === today
 *   next_3_days    today + next 2 days (today through today+2)
 *   next_7_days    today through today+6
 *   next_14_days   today through today+13
 *   this_month     deadline falls in the current calendar month
 *
 * Combine with the (existing) `showCompleted` toggle and tag chips.
 */
export type DeadlineFilter =
  | "any"
  | "has_deadline"
  | "no_deadline"
  | "overdue"
  | "today"
  | "next_3_days"
  | "next_7_days"
  | "next_14_days"
  | "this_month";

/**
 * Persisted filter state. Stored as `User.defaultFilters` (Json) so it
 * roams across devices.
 */
export type FilterState = {
  selectedTagIds: string[];
  expandedTagIds: string[];
  showCompleted: boolean;
  deadlineFilter: DeadlineFilter;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  selectedTagIds: [],
  expandedTagIds: [],
  showCompleted: true,
  deadlineFilter: "any",
};
