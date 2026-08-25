"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const raw = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };

  const username = raw("username");
  const fullName = raw("full_name");
  const dob = raw("date_of_birth");

  // Validate here for a clear message; the database CHECK constraints are the
  // actual enforcement, so a crafted request can't get past them either.
  if (username && !USERNAME_RE.test(username)) {
    return {
      ok: false,
      message: "Username must be 3–20 characters: letters, numbers, underscore.",
    };
  }
  if (fullName.length > 80) {
    return { ok: false, message: "Name is too long (80 characters max)." };
  }
  if (dob) {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime()) || d >= new Date()) {
      return { ok: false, message: "Enter a valid date of birth in the past." };
    }
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      username: username || null,
      full_name: fullName || null,
      date_of_birth: dob || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    // 23505 is unique_violation — the only one worth translating, since it is
    // the one a user can actually resolve.
    if (error.code === "23505") {
      return { ok: false, message: `"${username}" is already taken.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile saved." };
}

export async function updateEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();

  if (!email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  return {
    ok: true,
    // Supabase sends a confirmation link to the NEW address; the change only
    // lands once it's clicked. Saying "saved" here would be a lie.
    message: `Confirmation sent to ${email}. The change applies once you click that link.`,
  };
}

export async function updatePassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, message: "You're signed out — sign in again." };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < 6) {
    return { ok: false, message: "New password must be at least 6 characters." };
  }
  if (next !== confirm) {
    return { ok: false, message: "The two new passwords don't match." };
  }

  // Supabase's updateUser does NOT require the current password — an unattended
  // logged-in session could otherwise be used to lock the owner out. Re-verify
  // by signing in with it first.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauthError) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Password changed." };
}

export async function resetAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const accountId = String(formData.get("account_id") ?? "");
  const amount = Number(formData.get("starting_cash"));

  if (!Number.isFinite(amount) || amount < 100 || amount > 100_000_000) {
    return { ok: false, message: "Enter an amount between $100 and $100,000,000." };
  }
  // Typing "reset" is the guard. This wipes the trade ledger, and an
  // append-only ledger you can clear with one stray click is not much of a
  // ledger. Export first if you want to keep it.
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "reset") {
    return { ok: false, message: 'Type "reset" to confirm.' };
  }

  const { error } = await supabase.rpc("reset_account", {
    p_account_id: accountId,
    p_starting_cash: amount,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return {
    ok: true,
    message: `Account reset. Starting cash is now $${amount.toLocaleString("en-US")}.`,
  };
}
