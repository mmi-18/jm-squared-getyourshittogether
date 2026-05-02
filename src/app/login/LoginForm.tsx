"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

/**
 * Email + password sign-in form.
 *
 * On success, BetterAuth sets the session cookie via the `nextCookies()`
 * plugin and we redirect to /matrix. On failure we surface BetterAuth's
 * error message (typically "Invalid credentials").
 */
export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await signIn.email({ email, password });
      if (err) {
        setError(err.message ?? "Sign-in failed");
        return;
      }
      router.push("/matrix");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Email
        <input
          type="email"
          required
          autoFocus
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
          autoComplete="current-password"
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
