import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Auth-required layout for the protected app.
 *
 * Every route under (app)/ — /matrix, /import, etc. — is gated behind a
 * server-side session check. Unauthenticated visitors are bounced to /login.
 * Pages inside this group can call `requireUser()` without re-checking
 * because the layout has already enforced the redirect.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}
