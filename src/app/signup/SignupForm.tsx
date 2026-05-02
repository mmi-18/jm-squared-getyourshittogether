"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

/**
 * Sign-up form. Stamps the browser-detected timezone on the new user so the
 * schedule recurrence math works out of the box. BetterAuth's
 * `databaseHooks.user.create.after` hook (in src/lib/auth.ts) seeds the
 * 3 starter tags, so the user lands on /matrix with a populated state.
 */
export function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await signUp.email({
        email,
        password,
        name,
        // Browser-resolved IANA TZ (e.g. "Europe/Berlin"). Falls back to
        // "UTC" if the runtime can't resolve it.
        timezone:
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
            : "UTC",
      });
      if (err) {
        setError(err.message ?? "Sign-up failed");
        return;
      }
      router.push("/matrix");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Name
        <input
          type="text"
          required
          autoFocus
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border focus:border-foreground rounded-md border bg-surface px-3 py-2 text-sm outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border focus:border-foreground rounded-md border bg-surface px-3 py-2 text-sm outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-border focus:border-foreground rounded-md border bg-surface px-3 py-2 text-sm outline-none"
        />
      </label>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background mt-2 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
