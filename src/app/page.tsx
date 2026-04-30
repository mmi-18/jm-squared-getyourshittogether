import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/matrix");

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Get Your Shit Together
        </h1>
        <p className="text-muted-foreground mt-4 text-base">
          The Eisenhower Matrix, as a personal task manager. Urgent × Important,
          drag-and-drop, tagged, offline-first.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/login"
            className="bg-foreground text-background inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
