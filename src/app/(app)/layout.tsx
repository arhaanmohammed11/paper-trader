import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  // getUser(), never getSession() — getSession() trusts the cookie without
  // revalidating the JWT, so it can report a user who is actually signed out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects, but a layout must not assume that: this
  // is the guard that makes the pages below provably unreachable when signed out.
  if (!user) redirect("/login");

  // Prefer the chosen username; fall back to the email's local part, then the
  // full email. A brand-new account has no profile row yet, so this must cope
  // with null rather than rendering "null" in the nav.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    profile?.username?.trim() || user.email?.split("@")[0] || "Account";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Paper Trader
          </Link>
          <Link
            href="/history"
            className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
          >
            History
          </Link>
          <Link
            href="/settings"
            className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
          >
            Settings
          </Link>
          <span
            title={user.email ?? undefined}
            className="ml-auto hidden text-sm text-black/50 sm:inline dark:text-white/50"
          >
            {displayName}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-black/60 underline-offset-4 hover:underline dark:text-white/60"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
