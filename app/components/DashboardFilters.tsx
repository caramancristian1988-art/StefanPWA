"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

const fldCls = (val: string) =>
  `h-8 appearance-none sel-arrow rounded-lg border pl-2 pr-7 text-xs outline-none focus:border-brand ${
    val
      ? "border-brand bg-brand/10 font-semibold text-brand"
      : "border-[var(--color-line)] bg-[var(--color-surface)] text-ink"
  }`;

export default function DashboardFilters({
  prio,
  sort,
  ps,
}: {
  prio: string;
  sort: string;
  ps: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, start] = useTransition();

  function patch(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { prio, sort, ps, page: "1", ...updates };
    for (const [k, v] of Object.entries(merged)) {
      if (!v || v === "1") continue;
      if (k === "ps" && v === "20") continue;
      params.set(k, v);
    }
    const qs = params.toString();
    start(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`));
  }

  const hasFilters = !!(prio || sort);

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <select value={prio} onChange={(e) => patch({ prio: e.target.value })} className={fldCls(prio)}>
        <option value="">Prioritate: toate</option>
        <option value="URGENT">Urgentă</option>
        <option value="HIGH">Ridicată</option>
        <option value="MEDIUM">Medie</option>
        <option value="LOW">Scăzută</option>
      </select>
      <select value={sort} onChange={(e) => patch({ sort: e.target.value })} className={fldCls(sort)}>
        <option value="">Sortare: implicit</option>
        <option value="dueAsc">Deadline ↑ (cele mai apropiate)</option>
        <option value="dueDesc">Deadline ↓ (cele mai îndepărtate)</option>
      </select>
      {hasFilters && (
        <button
          onClick={() => patch({ prio: "", sort: "" })}
          className="tap h-8 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
        >
          Resetează
        </button>
      )}
      <select
        value={ps || "20"}
        onChange={(e) => patch({ ps: e.target.value })}
        className="ml-auto h-8 appearance-none sel-arrow rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] pl-2 pr-7 text-xs outline-none focus:border-brand"
        title="Înregistrări pe pagină"
      >
        <option value="20">20 / pag.</option>
        <option value="50">50 / pag.</option>
        <option value="100">100 / pag.</option>
        <option value="200">200 / pag.</option>
        <option value="500">500 / pag.</option>
        <option value="1000">1000 / pag.</option>
        <option value="all">Toate</option>
      </select>
    </div>
  );
}
