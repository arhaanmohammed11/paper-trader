"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const credentials = { email, password };

    const { data, error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (authError) {
      setError(authError.message);
      setPending(false);
      return;
    }

    // Signup with "Confirm email" enabled returns a user but no session — the
    // account is not usable until they click the link.
    if (mode === "signup" && !data.session) {
      setCheckEmail(true);
      setPending(false);
      return;
    }

    // refresh() re-runs the middleware and server components with the new
    // cookie, so the dashboard sees the session on first render.
    router.push(next ?? "/dashboard");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">Check your email</p>
        <p className="text-black/60 dark:text-white/60">
          We sent a confirmation link to <strong>{email}</strong>. Click it, then
          sign in.
        </p>
        <Link href="/login" className="text-emerald-600 dark:text-emerald-400">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 6 characters"
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Working…"
          : mode === "login"
            ? "Sign in"
            : "Create account"}
      </Button>

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link
              href="/signup"
              className="text-emerald-600 dark:text-emerald-400"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link
              href="/login"
              className="text-emerald-600 dark:text-emerald-400"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
