"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  setSuperAdmin,
  type UserState,
} from "@/app/actions/users";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { NOTIFY_EVENTS } from "@/lib/notify-meta";
import { useToast } from "./toast";
import { IconX, IconPencil, IconTrash } from "./icons";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  notifyEvents: string[];
  telegramChatId: string | null;
  notifyScope: string;
  notifyTeamIds: string[];
  notifyMemberIds: string[];
};
type Opt = { id: string; name: string };

const input =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function UsersManager({
  users,
  teams = [],
  viewerIsSuper = false,
}: {
  users: UserRow[];
  teams?: Opt[];
  viewerIsSuper?: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(users);
  useEffect(() => setRows(users), [users]);
  const [dialog, setDialog] = useState<{ open: boolean; user: UserRow | null }>({
    open: false,
    user: null,
  });

  const [fSearch, setFSearch] = useState("");
  const [fRole, setFRole] = useState("");
  const filtered = useMemo(() => {
    const term = fSearch.trim().toLowerCase();
    return rows.filter((u) => {
      if (fRole === "ADMIN" && u.role !== "ADMIN") return false;
      if (fRole === "STAFF" && u.role !== "STAFF") return false;
      if (fRole === "INACTIVE" && u.isActive) return false;
      if (term && !`${u.name} ${u.email}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, fSearch, fRole]);

  function toggle(u: UserRow) {
    const next = !u.isActive;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, isActive: next } : x))); // optimistic
    toggleUserActive(u.id, next)
      .then(() => toast.success(next ? "Utilizator activat" : "Utilizator dezactivat"))
      .catch(() => {
        setRows((r) => r.map((x) => (x.id === u.id ? { ...x, isActive: !next } : x)));
        toast.error("Acțiunea a eșuat");
      });
  }

  function toggleSuper(u: UserRow) {
    const next = !u.isSuperAdmin;
    if (!next && !confirm(`Retragi statutul de super-admin pentru „${u.name}"?`)) return;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, isSuperAdmin: next } : x))); // optimistic
    setSuperAdmin(u.id, next).then((res) => {
      if (res?.error) {
        setRows((r) => r.map((x) => (x.id === u.id ? { ...x, isSuperAdmin: !next } : x)));
        toast.error(res.error);
      } else {
        toast.success(next ? "Promovat la super-admin" : "Super-admin retras");
      }
    });
  }

  function remove(u: UserRow) {
    if (!confirm(`Ștergi utilizatorul „${u.name}"? Task-urile/proiectele lui trec la tine.`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== u.id)); // optimistic
    deleteUser(u.id).then((res) => {
      if (res?.error) {
        setRows(prev);
        toast.error(res.error);
      } else {
        toast.success("Utilizator șters");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setDialog({ open: true, user: null })}
        className="tap mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong"
      >
        + Utilizator nou
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          placeholder="Caută după nume sau email…"
          className="h-9 min-w-40 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
        />
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand">
          <option value="">Toți</option>
          <option value="ADMIN">Administratori</option>
          <option value="STAFF">Staff</option>
          <option value="INACTIVE">Dezactivați</option>
        </select>
        {(fSearch || fRole) && (
          <button onClick={() => { setFSearch(""); setFRole(""); }} className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]">
            Resetează
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card grid place-items-center p-8 text-center text-sm text-ink-soft">
          {rows.length === 0 ? "Niciun utilizator." : "Niciun rezultat pentru filtre."}
        </div>
      ) : (
      <div className="flex flex-col gap-2.5">
        {filtered.map((u) => (
          <div key={u.id} className="card flex items-center gap-3 p-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong">
              {u.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {u.name}
                {u.isSuperAdmin && (
                  <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-strong">Super</span>
                )}
                {!u.isActive && <span className="ml-2 text-xs text-st-cancelled">dezactivat</span>}
              </p>
              <p className="truncate text-xs text-ink-soft">
                {u.email} · {u.role === "ADMIN" ? "Administrator" : `${u.permissions.length} permisiuni`}
                {u.telegramChatId ? " · ✈ Telegram" : ""}
              </p>
            </div>
            {viewerIsSuper && (
              <button
                onClick={() => toggleSuper(u)}
                className={`tap rounded-lg border px-2.5 py-1.5 text-xs ${
                  u.isSuperAdmin
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
                }`}
                title={u.isSuperAdmin ? "Retrage super-admin" : "Fă super-admin"}
              >
                {u.isSuperAdmin ? "Super ✓" : "Super"}
              </button>
            )}
            <button
              onClick={() => toggle(u)}
              className="tap rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)]"
            >
              {u.isActive ? "Dezactivează" : "Activează"}
            </button>
            <button
              onClick={() => setDialog({ open: true, user: u })}
              className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
              title="Editează"
            >
              <IconPencil className="size-4" />
            </button>
            <button
              onClick={() => remove(u)}
              className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-st-cancelled hover:bg-[var(--color-surface-2)]"
              title="Șterge"
            >
              <IconTrash className="size-4" />
            </button>
          </div>
        ))}
      </div>
      )}

      {dialog.open && (
        <UserDialog
          user={dialog.user}
          allUsers={rows}
          teams={teams}
          onClose={() => setDialog({ open: false, user: null })}
        />
      )}
    </>
  );
}

function UserDialog({
  user,
  allUsers,
  teams,
  onClose,
}: {
  user: UserRow | null;
  allUsers: UserRow[];
  teams: Opt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const action = user ? updateUser : createUser;
  const [state, formAction, pending] = useActionState<UserState, FormData>(action, undefined);
  const [role, setRole] = useState<"ADMIN" | "STAFF">(user?.role ?? "STAFF");
  const [notifyScope, setNotifyScope] = useState<string>(user?.notifyScope ?? "ALL");
  const staffOptions = allUsers.filter((u) => u.id !== user?.id);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{user ? "Editează utilizator" : "Utilizator nou"}</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          {user && <input type="hidden" name="id" value={user.id} />}
          <input name="name" defaultValue={user?.name ?? ""} placeholder="Nume *" required className={input} />
          <input name="email" type="email" defaultValue={user?.email ?? ""} placeholder="Email *" required className={input} />
          <input
            name="password"
            type="password"
            placeholder={user ? "Parolă nouă (lasă gol = neschimbată)" : "Parolă * (min 8)"}
            required={!user}
            className={input}
          />

          <div>
            <input
              name="telegramChatId"
              defaultValue={user?.telegramChatId ?? ""}
              placeholder="Telegram chat ID (pentru notificări)"
              inputMode="numeric"
              className={input}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Opțional. Userul își află ID-ul scriind <b>/start</b> botului <b>@userinfobot</b> pe Telegram.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select name="role" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")} className={input}>
              <option value="STAFF">Angajat (permisiuni)</option>
              <option value="ADMIN">Administrator (tot)</option>
            </select>
            <label className="flex items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={user?.isActive ?? true} className="size-4 accent-[var(--color-brand)]" />
              Activ
            </label>
          </div>

          {role === "STAFF" && (
            <div className="rounded-xl border border-[var(--color-line)] p-3">
              <p className="mb-2 text-xs font-semibold text-ink-soft">Permisiuni</p>
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
                            defaultChecked={user?.permissions.includes(it.key) ?? false}
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

          <div className="rounded-xl border border-[var(--color-line)] p-3">
            <p className="mb-1 text-xs font-semibold text-ink-soft">Notificări (ce evenimente primește)</p>
            <p className="mb-2 text-[11px] text-ink-soft">
              Pe lângă astea, primește mereu notificările directe (task asignat lui, schimbări pe task-urile lui).
              Listă goală = toate tipurile de evenimente.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {NOTIFY_EVENTS.map((e) => (
                <label key={e.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="notifyEvents"
                    value={e.key}
                    defaultChecked={user?.notifyEvents.includes(e.key) ?? false}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {e.label}
                </label>
              ))}
            </div>
          </div>

          {role === "ADMIN" && (
            <div className="rounded-xl border border-[var(--color-line)] p-3">
              <p className="mb-1 text-xs font-semibold text-ink-soft">Sursa notificărilor (ca administrator)</p>
              <p className="mb-2 text-[11px] text-ink-soft">
                Filtrează ce notificări de task/tichet primește acest administrator, în funcție de
                echipă sau membru. Tipurile de mai sus se aplică în continuare peste acest filtru.
              </p>
              <div className="mb-2 flex flex-wrap gap-3">
                {[
                  { v: "ALL", l: "Toate echipele/membrii" },
                  { v: "TEAMS", l: "Doar anumite echipe" },
                  { v: "MEMBERS", l: "Doar anumiți membri" },
                ].map((o) => (
                  <label key={o.v} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="notifyScope"
                      value={o.v}
                      checked={notifyScope === o.v}
                      onChange={() => setNotifyScope(o.v)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {o.l}
                  </label>
                ))}
              </div>

              {notifyScope === "TEAMS" && (
                <div className="grid grid-cols-2 gap-1.5">
                  {teams.length === 0 && <p className="text-xs text-ink-soft">Nicio echipă creată încă.</p>}
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="notifyTeamIds"
                        value={t.id}
                        defaultChecked={user?.notifyTeamIds.includes(t.id) ?? false}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}

              {notifyScope === "MEMBERS" && (
                <div className="grid grid-cols-2 gap-1.5">
                  {staffOptions.length === 0 && <p className="text-xs text-ink-soft">Niciun alt utilizator încă.</p>}
                  {staffOptions.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="notifyMemberIds"
                        value={u.id}
                        defaultChecked={user?.notifyMemberIds.includes(u.id) ?? false}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
          <button type="submit" disabled={pending} className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Salvează"}
          </button>
        </form>
      </div>
    </div>
  );
}
