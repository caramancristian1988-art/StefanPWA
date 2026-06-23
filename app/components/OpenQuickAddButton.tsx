"use client";

import { useQuickAdd } from "./quick-add-context";

export default function OpenQuickAddButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { open } = useQuickAdd();
  return (
    <button
      onClick={() => open()}
      className={
        className ??
        "tap flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-base font-semibold text-white shadow-lg shadow-brand/25 hover:bg-brand-strong"
      }
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {children ?? "Adaugă programare"}
    </button>
  );
}
