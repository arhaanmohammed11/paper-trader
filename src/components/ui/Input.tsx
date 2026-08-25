import type { ComponentProps } from "react";

type Props = ComponentProps<"input"> & { label: string };

export function Input({ label, id, className = "", ...rest }: Props) {
  const inputId = id ?? rest.name;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        className={
          "h-10 w-full rounded-lg border border-black/15 bg-transparent px-3 text-sm " +
          "placeholder:text-black/35 focus:border-emerald-500 focus:outline-none " +
          "dark:border-white/20 dark:placeholder:text-white/35 " +
          className
        }
        {...rest}
      />
    </div>
  );
}
