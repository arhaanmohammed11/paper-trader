// One place that reads the Supabase env vars, so a missing value fails with a
// sentence you can act on instead of a bare "TypeError: Invalid URL".
//
// ⚠ Each var MUST be written out as a literal `process.env.NEXT_PUBLIC_XXX`.
// Next.js inlines NEXT_PUBLIC_* into browser bundles by *textual* substitution,
// so a computed lookup like `process.env[name]` is undefined in the browser
// while working fine on the server — which fails only at the moment a user
// clicks submit. Do not "simplify" these back into a lookup.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see .env.example) and restart ` +
        `the dev server — Next.js only reads env files at startup.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
