"use client";

import { useEffect, useState } from "react";
import { setStatus as setStatusAction } from "@/app/actions/appointments";
import { KANBAN_COLUMNS, STATUS_META } from "./status";
import { useToast } from "./toast";
import type { ApptStatus, ApptVM } from "./types";

export default function KanbanBoard({ items }: { items: ApptVM[] }) {
  const toast = useToast();
  const [list, setList] = useState(items);
  useEffect(() => setList(items), [items]);

  const byStatus = new Map<ApptStatus, ApptVM[]>();
  for (const col of KANBAN_COLUMNS) byStatus.set(col.status, []);
  for (const it of list) byStatus.get(it.status)?.push(it);

  async function move(id: string, status: ApptStatus) {
    const prev = list;
    setList((cur) => cur.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    const res = await setStatusAction(id, status);
    if (res?.error) {
      setList(prev); // rollback
      toast.error(res.error);
    } else {
      toast.success(`Mutat în „${STATUS_META[status].label}"`);
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const colItems = byStatus.get(col.status) ?? [];
        const meta = STATUS_META[col.status];
        return (
          <div key={col.status} className="flex w-72 shrink-0 flex-col">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={`size-2.5 rounded-full ${meta.dot}`} />
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="ml-auto rounded-full bg-[var(--color-surface-2)] px-2 text-xs text-ink-soft">
                {colItems.length}
              </span>
            </div>
            <div className="flex min-h-20 flex-col gap-2 rounded-2xl bg-[var(--color-surface-2)]/60 p-2">
              {colItems.map((a) => (
                <div key={a.id} className={`card border-l-4 p-3 ${meta.ring}`} style={{ borderLeftColor: a.categoryColor ?? undefined }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.clientName}</span>
                    <span className="text-xs tabular-nums text-ink-soft">{a.time}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {a.categoryName ?? a.title} · {a.dateKey}
                  </p>
                  <select
                    value={a.status}
                    onChange={(e) => move(a.id, e.target.value as ApptStatus)}
                    className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs outline-none"
                  >
                    {KANBAN_COLUMNS.map((c) => (
                      <option key={c.status} value={c.status}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {colItems.length === 0 && (
                <p className="py-3 text-center text-xs text-ink-soft">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
