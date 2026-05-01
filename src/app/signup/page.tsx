import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SignupForm } from "./SignupForm";

/**
 * Sign-up page.
 *
 * Single-user lockdown: once any User row exists in the DB, this page
 * shows a "signups closed" message and redirects to /login. After Mario
 * creates his account, no one else can sign up — without us touching the
 * code or removing the route. Easier to reason about than an allowlist.
 */
export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/matrix");

  // Signups are open until the first user signs up. After that, the page
  // becomes a redirect (BetterAuth's `signUp` endpoint stays callable but
  // the UI goes away — we'd add a server-side guard there too if we ever
  // worry about API-direct signups).
  const existingCount = await db.user.count();
  const signupsOpen = existingCount === 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {signupsOpen ? "Create your account" : "Signups closed"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Get Your Shit Together
          </p>
        </div>

        {signupsOpen ? (
          <>
            <SignupForm />
            <p className="text-muted-foreground mt-6 text-center text-xs">
              Already have an account?{" "}
              <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <div className="border-border bg-muted text-muted-foreground rounded-md border p-4 text-center text-sm">
            <p>This is a single-user app and signups are closed.</p>
            <Link
              href="/login"
              className="text-foreground mt-3 inline-block underline-offset-4 hover:underline"
            >
              Go to sign in →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
