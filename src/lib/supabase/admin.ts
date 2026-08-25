import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/**
 * Service-role client. **Bypasses Row Level Security entirely.**
 *
 * Only for route handlers that write `quote_cache` / `instruments` — the tables
 * users may read but never write. Never import this from a Client Component;
 * the `server-only` import above turns that mistake into a build error rather
 * than a secret shipped to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
