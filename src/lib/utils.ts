import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The standard `cn(...)` className helper. Composes class strings via clsx
 * (handling falsy / object syntax) then dedupes Tailwind utilities so the
 * last-passed class wins (`cn("p-2", "p-4") === "p-4"`).
 *
 *   <div className={cn("rounded p-2", isActive && "bg-blue-500", props.className)} />
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
