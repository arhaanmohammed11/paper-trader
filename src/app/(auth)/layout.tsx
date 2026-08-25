import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Link href="/" className="text-2xl font-semibold tracking-tight">
        Paper Trader
      </Link>
      {children}
    </main>
  );
}
