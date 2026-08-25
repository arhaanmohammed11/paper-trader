import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Paths reachable while signed out. Everything else redirects to /login. */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p)),
  );
}

/**
 * Refreshes the auth cookie on every navigation and gates protected routes.
 *
 * This is the official @supabase/ssr snippet. It looks redundant — it is not.
 * Two changes here cause hours of debugging:
 *   - returning a *fresh* NextResponse instead of `supabaseResponse` drops the
 *     refreshed cookies, so users get signed out at random (~1h, when the JWT
 *     expires and the refresh never reaches the browser).
 *   - using getSession() instead of getUser() skips JWT revalidation, so it can
 *     report a signed-in user who isn't.
 * Do not tidy this function.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not add code between createServerClient and getUser(). Anything that
  // reads cookies in between sees a stale session.
  // IMPORTANT: DO NOT REMOVE auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return `supabaseResponse` itself. If you build a new response,
  // copy over `supabaseResponse.cookies` or sessions will break.
  return supabaseResponse;
}
