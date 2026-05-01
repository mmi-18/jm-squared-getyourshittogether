"use client";

import { LogOut, Moon, Sun, Tags as TagsIcon } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Theme } from "@prisma/client";
import { updateUserTheme } from "@/app/(app)/_actions/settings";

export function Header({
  userEmail,
  theme,
  onOpenTags,
}: {
  userEmail: string;
  theme: Theme;
  onOpenTags: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cycleTheme = () => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    startTransition(async () => {
      await updateUserTheme(next);
      applyTheme(next);
      router.refresh();
    });
  };

  return (
    <header className="bg-surface border-border flex flex-shrink-0 items-center gap-3 border-b px-4 py-2.5">
      <h1 className="text-[15px] font-semibold tracking-tight">
        Get Your Shit Together
      </h1>
      <span className="text-muted-foreground hidden text-xs sm:inline">
        {userEmail}
      </span>
      <div className="flex-1" />

      <button
        onClick={onOpenTags}
        className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs"
        aria-label="Manage tags"
      >
        <TagsIcon size={13} />
        Manage tags
      </button>

      <button
        onClick={cycleTheme}
        disabled={pending}
        className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs"
        aria-label={`Theme: ${theme} (click to cycle)`}
        title={`Theme: ${theme}`}
      >
        {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
        <span className="capitalize">{theme}</span>
      </button>

      <button
        onClick={() =>
          startTransition(async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          })
        }
        disabled={pending}
        className="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs"
        aria-label="Sign out"
      >
        <LogOut size={13} />
        <span className={cn("hidden sm:inline")}>Sign out</span>
      </button>
    </header>
  );
}

/**
 * Apply the chosen theme to <html>. Exposed as a helper so the matrix client
 * can call it on mount (before the first paint that would otherwise show
 * the default light theme briefly).
 */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) root.classList.add("dark");
  }
}
