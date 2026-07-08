"use client";

import { useState, useTransition } from "react";
import { setTaskStatus } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";

export default function CloseTicketButton({ taskId }: { taskId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  function handleClose() {
    startTransition(async () => {
      await setTaskStatus(taskId, "DONE");
      setDone(true);
      router.refresh();
    });
  }

  if (done) return null;

  return (
    <button
      onClick={handleClose}
      disabled={isPending}
      className="shrink-0 rounded-xl border border-st-done/40 bg-st-done/10 px-3 py-1.5 text-sm font-semibold text-st-done transition-colors hover:bg-st-done/20 disabled:opacity-50"
    >
      {isPending ? "Se închide…" : "✓ Închide tichet"}
    </button>
  );
}
