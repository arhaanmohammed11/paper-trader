"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  resetAccount,
  updateEmail,
  updatePassword,
  updateProfile,
  type ActionResult,
} from "@/app/(app)/settings/actions";
import { formatMoney } from "@/lib/format";

function SubmitButton({ children }: { children: React.ReactNode }) {
  // useFormStatus must be read from a component INSIDE the form, which is why
  // this is split out rather than inlined above.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        result.ok
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
      }`}
    >
      {result.message}
    </p>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-black/55 dark:text-white/55">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function ProfileForm({
  username,
  fullName,
  dateOfBirth,
}: {
  username: string;
  fullName: string;
  dateOfBirth: string;
}) {
  const [result, action] = useActionState(updateProfile, null);

  return (
    <Card title="Profile" description="How you appear inside the app.">
      <form action={action} className="space-y-4">
        <Input
          label="Username"
          name="username"
          defaultValue={username}
          placeholder="arhaan"
          pattern="[a-zA-Z0-9_]{3,20}"
          title="3–20 characters: letters, numbers, underscore"
        />
        <Input
          label="Full name"
          name="full_name"
          defaultValue={fullName}
          placeholder="Arhaan Mohammed"
          maxLength={80}
        />
        <Input
          label="Date of birth"
          name="date_of_birth"
          type="date"
          defaultValue={dateOfBirth}
          max={new Date().toISOString().slice(0, 10)}
        />
        <Notice result={result} />
        <SubmitButton>Save profile</SubmitButton>
      </form>
    </Card>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [result, action] = useActionState(updateEmail, null);

  return (
    <Card
      title="Email"
      description="Changing this sends a confirmation link to the new address. It only takes effect once you click it."
    >
      <form action={action} className="space-y-4">
        <Input
          label="Email address"
          name="email"
          type="email"
          defaultValue={email}
          required
        />
        <Notice result={result} />
        <SubmitButton>Change email</SubmitButton>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [result, action] = useActionState(updatePassword, null);

  return (
    <Card title="Password">
      <form action={action} className="space-y-4">
        <Input
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
        <Input
          label="Confirm new password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
        <Notice result={result} />
        <SubmitButton>Change password</SubmitButton>
      </form>
    </Card>
  );
}

export function ResetAccountForm({
  accountId,
  currentStartingCash,
  tradeCount,
}: {
  accountId: string;
  currentStartingCash: number;
  tradeCount: number;
}) {
  const [result, action] = useActionState(resetAccount, null);

  return (
    <Card
      title="Starting cash"
      description="Reset the account and choose what you start with. This clears every position and wipes the trade ledger."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="account_id" value={accountId} />
        <Input
          label="Starting cash (USD)"
          name="starting_cash"
          type="number"
          min={100}
          max={100000000}
          step={100}
          defaultValue={currentStartingCash}
          required
        />
        <p className="text-xs text-black/50 dark:text-white/50">
          Currently {formatMoney(currentStartingCash)}
          {tradeCount > 0 && (
            <>
              {" · "}
              <strong>{tradeCount}</strong> trade{tradeCount === 1 ? "" : "s"} will be
              deleted.{" "}
              <a href="/api/trades/export" className="underline underline-offset-2">
                Export them first
              </a>
              .
            </>
          )}
        </p>
        <Input
          label={'Type "reset" to confirm'}
          name="confirm"
          placeholder="reset"
          autoComplete="off"
          required
        />
        <Notice result={result} />
        <SubmitButton>Reset account</SubmitButton>
      </form>
    </Card>
  );
}
