"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCategory,
  deleteCategory,
  type SettingsState,
} from "@/app/actions/settings";
import type { CategoryLite } from "./types";
import { useToast } from "./toast";
import { IconX } from "./icons";

export default function CategoriesManager({ categories }: { categories: CategoryLite[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(categories);
  useEffect(() => setRows(categories), [categories]);
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    createCategory,
    undefined,
  );
  const [color, setColor] = useState("#0d9488");

  useEffect(() => {
    if (state?.ok) {
      toast.success("Categorie adăugată");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router, toast]);

  function remove(id: string) {
    const prev = rows;
    setRows((r) => r.filter((c) => c.id !== id)); // optimistic
    deleteCategory(id)
      .then(() => toast.success("Categorie ștearsă"))
      .catch(() => {
        setRows(prev);
        toast.error("Ștergerea a eșuat");
      });
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-bold">Categorii</h2>

      <div className="flex flex-wrap gap-2">
        {rows.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-2 rounded-full border border-[var(--color-line)] py-1.5 pl-3 pr-1.5 text-sm"
          >
            <span className="size-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            <span className="text-xs text-ink-soft">{c.defaultDurationMinutes}m</span>
            <button
              onClick={() => remove(c.id)}
              className="tap grid size-6 place-items-center rounded-full text-ink-soft hover:bg-st-cancelled/10 hover:text-st-cancelled"
              title="Șterge"
            >
              <IconX className="size-3.5" />
            </button>
          </span>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-soft">Nicio categorie.</p>}
      </div>

      <form action={action} className="flex flex-wrap items-end gap-2">
        <input name="name" placeholder="Nume categorie" required className="h-11 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand" />
        <input type="number" name="defaultDurationMinutes" defaultValue={30} min={0} step="any" inputMode="decimal" title="Durată implicită (min)" className="h-11 w-20 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand" />
        <input type="color" name="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-11 rounded-xl border border-[var(--color-line)] bg-transparent" />
        <button type="submit" disabled={pending} className="tap h-11 rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          Adaugă
        </button>
      </form>
      {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
    </div>
  );
}
