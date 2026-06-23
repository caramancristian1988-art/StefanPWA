"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionLabel, moduleLabel, AUDIT_MODULES, ACTION_OPTIONS } from "@/lib/audit-meta";
import { IconChevronLeft, IconChevronRight, IconX } from "./icons";

type Opt = { id: string; name: string };
type Row = {
  id: string;
  userId: string | null;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  objectId: string | null;
  objectName: string | null;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | Date;
};
type Filters = {
  user: string;
  role: string;
  action: string;
  module: string;
  from: string;
  to: string;
  q: string;
};

const fld =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "medium" });
}

export default function AuditLogsClient({
  items,
  users,
  page,
  hasMore,
  filters,
}: {
  items: Row[];
  users: Opt[];
  page: number;
  hasMore: boolean;
  filters: Filters;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<Row | null>(null);

  function apply(patch: Partial<Filters & { page: number }>) {
    const next: Record<string, string> = {
      user: filters.user,
      role: filters.role,
      action: filters.action,
      module: filters.module,
      from: filters.from,
      to: filters.to,
      q: filters.q,
      ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v ?? "")])),
    };
    // schimbarea filtrelor resetează pagina la 1 (dacă nu s-a cerut explicit altă pagină)
    if (!("page" in patch)) next.page = "1";
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && v !== "1") usp.set(k, v);
    if (next.page && next.page !== "1") usp.set("page", next.page);
    const qs = usp.toString();
    router.push(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  }

  const activeFilters = Boolean(
    filters.user || filters.role || filters.action || filters.module || filters.from || filters.to || filters.q,
  );

  return (
    <>
      {/* Filtre (server-side) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); apply({ q }); }}
          className="flex min-w-40 flex-1 items-center"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută obiect/utilizator… (Enter)"
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
          />
        </form>
        <select value={filters.user} onChange={(e) => apply({ user: e.target.value })} className={fld}>
          <option value="">Utilizator: toți</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filters.role} onChange={(e) => apply({ role: e.target.value })} className={fld}>
          <option value="">Rol: toate</option>
          <option value="ADMIN">Administrator</option>
          <option value="STAFF">Staff</option>
        </select>
        <select value={filters.module} onChange={(e) => apply({ module: e.target.value })} className={fld}>
          <option value="">Modul: toate</option>
          {AUDIT_MODULES.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
        </select>
        <select value={filters.action} onChange={(e) => apply({ action: e.target.value })} className={fld}>
          <option value="">Acțiune: toate</option>
          {ACTION_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} title="De la" className={fld} />
        <input type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} title="Până la" className={fld} />
        {activeFilters && (
          <button
            onClick={() => { setQ(""); router.push("/admin/audit-logs"); }}
            className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            Resetează
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
          {activeFilters ? "Niciun log pentru filtrele alese." : "Niciun log încă."}
        </div>
      ) : (
        <>
          {/* Header tabel (desktop) */}
          <div className="hidden grid-cols-[150px_1fr_1fr_110px_1fr] gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase text-ink-soft lg:grid">
            <span>Data &amp; ora</span>
            <span>Utilizator</span>
            <span>Acțiune</span>
            <span>Modul</span>
            <span>Obiect</span>
          </div>
          <div className="flex flex-col gap-1">
            {items.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="card grid grid-cols-1 gap-1 px-3 py-2 text-left lg:grid-cols-[150px_1fr_1fr_110px_1fr] lg:items-center lg:gap-2"
              >
                <span className="text-[11px] tabular-nums text-ink-soft">{fmt(r.createdAt)}</span>
                <span className="truncate text-sm">
                  <span className="font-medium">{r.userName}</span>
                  <span className="ml-1 text-[11px] text-ink-soft">{r.userRole}</span>
                </span>
                <span className="truncate text-sm">{actionLabel(r.action)}</span>
                <span className="text-[11px]">
                  <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-ink-soft">{moduleLabel(r.module)}</span>
                </span>
                <span className="truncate text-[13px] text-ink-soft">{r.objectName ?? r.objectId ?? "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => apply({ page: page - 1 })}
            className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            <IconChevronLeft className="size-4" /> Anterior
          </button>
          <span className="text-sm text-ink-soft">Pagina {page}</span>
          <button
            disabled={!hasMore}
            onClick={() => apply({ page: page + 1 })}
            className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            Următor <IconChevronRight className="size-4" />
          </button>
        </div>
      )}

      {selected && <Drawer row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Drawer({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-md overflow-auto bg-[var(--color-surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Detalii log</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-[var(--color-surface-2)] p-3 text-sm">
          <b>{row.userName}</b> — {actionLabel(row.action).toLowerCase()}
          {row.objectName ? <> „<b>{row.objectName}</b>"</> : null} la {fmt(row.createdAt)}.
        </p>

        <dl className="flex flex-col gap-2.5 text-sm">
          <Field k="Utilizator" v={`${row.userName} (${row.userRole})`} />
          <Field k="Acțiune" v={actionLabel(row.action)} mono={row.action} />
          <Field k="Modul" v={moduleLabel(row.module)} />
          <Field k="Obiect" v={row.objectName ?? "—"} mono={row.objectId ?? undefined} />
          {row.oldValue != null && <Field k="Valoare veche" v={row.oldValue} pre />}
          {row.newValue != null && <Field k="Valoare nouă" v={row.newValue} pre />}
          <Field k="Data & ora" v={fmt(row.createdAt)} />
          <Field k="IP" v={row.ip ?? "—"} />
          <Field k="Browser" v={row.userAgent ?? "—"} pre />
        </dl>
      </div>
    </div>
  );
}

function Field({ k, v, mono, pre }: { k: string; v: string; mono?: string; pre?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase text-ink-soft">{k}</dt>
      <dd className={`${pre ? "whitespace-pre-wrap break-words" : "break-words"} text-sm`}>
        {v}
        {mono && <span className="ml-1 text-[11px] text-ink-soft">[{mono}]</span>}
      </dd>
    </div>
  );
}
