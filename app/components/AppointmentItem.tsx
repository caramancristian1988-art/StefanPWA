"use client";

import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { setStatus as setStatusAction, deleteAppointment } from "@/app/actions/appointments";
import { STATUS_META } from "./status";
import { useToast } from "./toast";
import { IconMail, IconSend, IconTrash, IconChevronRight } from "./icons";
import type { ApptStatus, ApptVM } from "./types";

const APPT_STATUSES: ApptStatus[] = [
  "NEW", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED", "NO_SHOW",
];

export default function AppointmentItem({ appt }: { appt: ApptVM }) {
  const toast = useToast();
  const [status, setStatus] = useState<ApptStatus>(appt.status);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function change(next: ApptStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    const res = await setStatusAction(appt.id, next);
    setBusy(false);
    if (res?.error) {
      setStatus(prev);
      toast.error(res.error);
    } else {
      toast.success(`Status: ${STATUS_META[next].label}`);
    }
  }

  async function remove() {
    if (!confirm("Ștergi programarea?")) return;
    setRemoved(true);
    try {
      await deleteAppointment(appt.id);
      toast.success("Programare ștearsă");
    } catch {
      setRemoved(false);
      toast.error("Ștergerea a eșuat");
    }
  }

  if (removed) return null;

  return (
    <div className={`card overflow-hidden ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-brand">
              {appt.time}
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{appt.clientName}</span>
            {appt.categoryName && (
              <span className="hidden shrink-0 items-center gap-1 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-ink-soft sm:inline-flex">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: appt.categoryColor ?? "#6366f1" }}
                />
                {appt.categoryName}
              </span>
            )}
            <IconChevronRight
              className={`size-3.5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
            />
          </div>
          <p className="flex items-center gap-1 text-[11px] text-ink-soft">
            <span>{appt.time}–{appt.endTime}</span>
            {appt.title && <span>· {appt.title}</span>}
            {(appt.remEmail || appt.remTelegram) && (
              <span className="inline-flex items-center gap-0.5">
                {appt.remEmail && <IconMail className="size-3" />}
                {appt.remTelegram && <IconSend className="size-3" />}
              </span>
            )}
          </p>
        </button>

        <ApptStatusDropdown status={status} pending={busy} onChange={change} />

        <button
          onClick={remove}
          disabled={busy}
          className="tap grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] text-st-cancelled hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          title="Șterge"
        >
          <IconTrash className="size-3.5" />
        </button>
      </div>

      {open && appt.title && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
          <p className="whitespace-pre-wrap text-[12px]">{appt.title}</p>
        </div>
      )}
    </div>
  );
}

function ApptStatusDropdown({
  status,
  pending,
  onChange,
}: {
  status: ApptStatus;
  pending: boolean;
  onChange: (s: ApptStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const meta = STATUS_META[status];

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, left: rect.left, minWidth: Math.max(rect.width, 144) });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={pending}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleOpen}
        className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] font-semibold transition-opacity disabled:opacity-50 ${meta.badge}`}
      >
        {meta.label}
      </button>
      {open && mounted && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-xl"
        >
          {APPT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-medium hover:bg-[var(--color-surface-2)] ${s === status ? "font-bold" : ""}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${STATUS_META[s].dot}`} />
              <span className={s === status ? "text-ink" : "text-ink-soft"}>{STATUS_META[s].label}</span>
              {s === status && <span className="ml-auto text-[10px] text-brand">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
