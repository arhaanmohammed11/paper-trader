import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  variant?: "primary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium " +
    "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500";
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500",
    ghost:
      "border border-black/15 hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]",
  }[variant];

  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}
