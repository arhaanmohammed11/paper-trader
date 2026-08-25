import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in · Paper Trader" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // searchParams is a Promise in Next 15+.
  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-lg font-medium">Sign in</h1>
      <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />
    </>
  );
}
