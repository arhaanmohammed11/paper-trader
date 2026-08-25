import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign up · Paper Trader" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-lg font-medium">Create your account</h1>
      <p className="-mt-3 text-sm text-black/60 dark:text-white/60">
        You&apos;ll start with $100,000 in virtual cash.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}
