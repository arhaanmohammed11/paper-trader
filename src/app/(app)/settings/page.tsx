import {
  EmailForm,
  PasswordForm,
  ProfileForm,
  ResetAccountForm,
} from "@/components/settings/SettingsForms";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings · Paper Trader" };

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  date_of_birth: string | null;
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .rpc("get_or_create_profile")
    .single<Profile>();

  const { data: account } = await supabase
    .rpc("get_or_create_account")
    .single<{ id: string; starting_cash: number }>();

  const { count: tradeCount } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-black/55 dark:text-white/55">
          Your account details.
        </p>
      </div>

      <ProfileForm
        username={profile?.username ?? ""}
        fullName={profile?.full_name ?? ""}
        dateOfBirth={profile?.date_of_birth ?? ""}
      />

      <EmailForm email={user?.email ?? ""} />

      <PasswordForm />

      {account && (
        <ResetAccountForm
          accountId={account.id}
          currentStartingCash={Number(account.starting_cash)}
          tradeCount={tradeCount ?? 0}
        />
      )}

      <section className="rounded-xl border border-black/10 p-5 text-xs text-black/45 dark:border-white/15 dark:text-white/45">
        <p className="font-mono">user id · {user?.id}</p>
        <p className="mt-1 font-mono">
          joined ·{" "}
          {user?.created_at
            ? new Date(user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "—"}
        </p>
      </section>
    </div>
  );
}
