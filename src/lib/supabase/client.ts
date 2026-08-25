import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for **Client Components only** ('use client').
 * Uses the publishable/anon key, so every read and write is still subject to
 * Row Level Security. Safe to ship to the browser.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL(), SUPABASE_ANON_KEY());
}
