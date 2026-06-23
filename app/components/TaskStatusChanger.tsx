"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "@/app/actions/tasks";
import { useToast } from "./toast";

type Status = "NEW" | "ASSIGNED" | "READ" | "IN_PROGRESS" | "ON_HOLD" | "REVIEW" | "DONE" | "CANCELLED";

const ALL: Status[] = ["NEW", "ASSIGNED", "READ", "IN_PROGRESS", "ON_HOLD", "REVIEW", "DONE", "CANCELLED"];
const LABEL: Record<Status, string> = {
  NEW: "Nou", ASSIGNED: "Asignat", READ: "Citit", IN_PROGRESS: "În lucru",
  ON_HOLD: "În așteptare", REVIEW: "În verificare", DONE: "Finalizat", CANCELLED: "Anulat",
};

export default function TaskStatusChanger({
  taskId,
  initialStatus,
}: {
  taskId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus as Status);
  const [busy, setBusy] = useState(false);

  const closed = status === "DONE" || status === "CANCELLED";

  async function change(next: Status) {
    if (next === status || busy) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    try {
      const res = await setTaskStatus(taskId, next);
      if (res?.error) {
        setStatus(prev);
        toast.error(res.error);
      } else {
        toast.success(`Status: ${LABEL[next]}`);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  const fld =
    "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm outline-none focus:border-brand disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {closed && (
        <button
          onClick={() => change("IN_PROGRESS")}
          disabled={busy}
          className="tap h-9 rounded-xl border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand/10 disabled:opacity-60"
        >
          ↩️ Redeschide task
        </button>
      )}
      <select
        value={status}
        onChange={(e) => change(e.target.value as Status)}
        disabled={busy}
        className={fld}
      >
        {ALL.map((s) => (
          <option key={s} value={s}>{LABEL[s]}</option>
        ))}
      </select>
    </div>
  );
}
