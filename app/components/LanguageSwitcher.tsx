"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n";

const FLAGS: Record<Locale, string> = { ro: "🇷🇴", en: "🇬🇧", ru: "🇷🇺" };
const LABELS: Record<Locale, string> = { ro: "RO", en: "EN", ru: "RU" };

export default function LanguageSwitcher() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const locales: Locale[] = ["ro", "en", "ru"];

  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-2)] px-1 py-0.5">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending || l === locale}
          onClick={() => startTransition(() => setLocale(l))}
          title={l === "ro" ? "Română" : l === "en" ? "English" : "Русский"}
          className={[
            "tap rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
            l === locale
              ? "bg-brand text-white"
              : "text-ink-soft hover:text-ink disabled:opacity-50",
          ].join(" ")}
        >
          {FLAGS[l]} {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
