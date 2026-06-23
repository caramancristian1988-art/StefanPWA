"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveTelegramContact, rejectTelegramContact, type ApproveState } from "@/app/actions/telegram";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { useToast } from "./toast";
import { IconX } from "./icons";

type Opt = { id: string; name: string };
type Contact = {
  id: string;
  telegramUserId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  requestedAt: string | Date;
};

const input =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function PendingTelegramUsers({
  contacts,
  teams,
}: {
  contacts: Contact[];
  teams: Opt[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(contacts);
  useEffect(() => setRows(contacts), [contacts]);
  const [dialog, setDialog] = useState<Contact | null>(null);

  function reject(c: Contact) {
    if (!confirm(`Respingi cererea de la ${c.firstName ?? c.username ?? c.telegramUserId}?`)) return;
    setRows((r) => r.filter((x) => x.id !== c.id));
    rejectTelegramContact(c.id)
      .then(() => toast.success("Cerere respinsă"))
      .catch(() => toast.error("Eroare"));
  }

  if (rows.length === 0) return null;

  return (
    <div className="card mb-5 p-5">
      <h2 className="mb-1 text-base font-bold">Utilizatori Telegram neatribuiți</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Au apăsat <b>/start</b> în bot, dar nu au încă un profil în CRM. Completează datele ca să
        primească task-uri și notificări.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
              {(c.firstName ?? c.username ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.firstName ?? "—"} {c.lastName ?? ""}
                {c.username && <span className="ml-1.5 text-ink-soft">@{c.username}</span>}
              </p>
              <p className="truncate text-xs text-ink-soft">Chat ID: {c.chatId}</p>
            </div>
            <button
              onClick={() => setDialog(c)}
              className="tap h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong"
            >
              Atribuie
            </button>
            <button
              onClick={() => reject(c)}
              className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-st-cancelled hover:bg-[var(--color-surface-2)]"
            >
              Respinge
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <ApproveDialog
          contact={dialog}
          teams={teams}
          onClose={() => setDialog(null)}
          onApproved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ApproveDialog({
  contact,
  teams,
  onClose,
  onApproved,
}: {
  contact: Contact;
  teams: Opt[];
  onClose: () => void;
  onApproved: () => void;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ApproveState, FormData>(approveTelegramContact, undefined);
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");

  useEffect(() => {
    if (state?.ok) {
      toast.success("Utilizator activat în Telegram");
      onApproved();
      onClose();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Atribuie utilizator Telegram</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="contactId" value={contact.id} />
          <div className="grid grid-cols-2 gap-3">
            <input name="firstName" defaultValue={contact.firstName ?? ""} placeholder="Nume *" required className={input} />
            <input name="lastName" defaultValue={contact.lastName ?? ""} placeholder="Prenume" className={input} />
          </div>
          <input name="phone" placeholder="Telefon (opțional)" className={input} />

          <select name="teamId" defaultValue="" className={input}>
            <option value="">Fără echipă</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <select name="role" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")} className={input}>
              <option value="STAFF">Angajat (permisiuni)</option>
              <option value="ADMIN">Administrator (tot)</option>
            </select>
            <label className="flex items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="isActive" defaultChecked className="size-4 accent-[var(--color-brand)]" />
              Activ
            </label>
          </div>

          {role === "STAFF" && (
            <div className="rounded-xl border border-[var(--color-line)] p-3">
              <p className="mb-2 text-xs font-semibold text-ink-soft">Permisiuni Telegram / CRM</p>
              <div className="flex flex-col gap-3">
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1 text-[11px] font-semibold uppercase text-ink-soft">{g.group}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.items.map((it) => (
                        <label key={it.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="permissions"
                            value={it.key}
                            defaultChecked={it.key === "tasks.view"}
                            className="size-4 accent-[var(--color-brand)]"
                          />
                          {it.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
          <button type="submit" disabled={pending} className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Activează"}
          </button>
        </form>
      </div>
    </div>
  );
}
