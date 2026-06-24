"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rowSummary, moduleLabel, AUDIT_MODULES, ACTION_OPTIONS } from "@/lib/audit-meta";
import { deleteAllAuditLogs } from "@/app/actions/audit";
import { IconChevronLeft, IconChevronRight, IconTrash } from "./icons";
import { useToast } from "./toast";

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
};

const fld =
  "h-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";

function fmtTime(d: string | Date): string {
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = String(dt.getMonth() + 1).padStart(2, "0");
  const yr = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${day}.${mon}.${yr} ${hh}:${mm}`;
}

function roleLabel(r: string): string {
  if (r.includes("SUPER")) return "Super";
  if (r.includes("ADMIN")) return "Admin";
  if (r.includes("STAFF")) return "Staff";
  return r.slice(0, 5);
}

function roleCls(r: string): string {
  if (r.includes("SUPER")) return "bg-purple-100 text-purple-700";
  if (r.includes("ADMIN")) return "bg-brand/10 text-brand";
  return "bg-[var(--color-surface-2)] text-ink-soft";
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
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function apply(patch: Partial<Filters & { page: number }>) {
    const next: Record<string, string> = {
      user: filters.user,
      role: filters.role,
      action: filters.action,
      module: filters.module,
      ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v ?? "")])),
    };
    if (!("page" in patch)) next.page = "1";
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && v !== "1") usp.set(k, v);
    if (next.page && next.page !== "1") usp.set("page", next.page);
    const qs = usp.toString();
    router.push(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  }

  function exportUrl(format: "csv" | "excel"): string {
    const sp = new URLSearchParams({ format });
    if (filters.user) sp.set("user", filters.user);
    if (filters.role) sp.set("role", filters.role);
    if (filters.action) sp.set("action", filters.action);
    if (filters.module) sp.set("module", filters.module);
    return `/api/admin/audit/export?${sp.toString()}`;
  }

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      const res = await deleteAllAuditLogs();
      if (res?.error) toast.error(res.error);
      else { toast.success("Toate log-urile au fost șterse."); setConfirmDelete(false); router.refresh(); }
    } finally {
      setDeleting(false);
    }
  }

  const activeFilters = Boolean(filters.user || filters.role || filters.action || filters.module);

  return (
    <>
      {/* Bară filtre + acțiuni */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={filters.user} onChange={(e) => apply({ user: e.target.value })} className={fld}>
          <option value="">Toți utilizatorii</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filters.role} onChange={(e) => apply({ role: e.target.value })} className={fld}>
          <option value="">Orice rol</option>
          <option value="ADMIN">Administrator</option>
          <option value="STAFF">Staff</option>
        </select>
        <select value={filters.module} onChange={(e) => apply({ module: e.target.value })} className={fld}>
          <option value="">Orice modul</option>
          {AUDIT_MODULES.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
        </select>
        <select value={filters.action} onChange={(e) => apply({ action: e.target.value })} className={fld}>
          <option value="">Orice acțiune</option>
          {ACTION_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        {activeFilters && (
          <button
            onClick={() => router.push("/admin/audit-logs")}
            className="h-8 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            Resetează
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <a
            href={exportUrl("csv")}
            download
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            ↓ CSV
          </a>
          <a
            href={exportUrl("excel")}
            download
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            ↓ Excel
          </a>
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <IconTrash className="size-3.5" />
            Șterge toate
          </button>
        </div>
      </div>

      {/* Confirmare ștergere */}
      {confirmDelete && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="flex-1 text-sm text-red-700">
            Toate log-urile vor fi șterse definitiv. Această acțiune nu poate fi anulată.
          </span>
          <button
            onClick={handleDeleteAll}
            disabled={deleting}
            className="h-7 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Se șterge…" : "Confirmă ștergerea"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="h-7 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)] disabled:opacity-60"
          >
            Anulează
          </button>
        </div>
      )}

      {/* Rânduri compacte */}
      {items.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
          {activeFilters ? "Niciun log pentru filtrele alese." : "Niciun log încă."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
          {/* Header — doar desktop */}
          <div className="hidden grid-cols-[130px_170px_160px_1fr] border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft lg:grid">
            <span>Data &amp; ora</span>
            <span>Utilizator</span>
            <span>Obiect</span>
            <span>Acțiune</span>
          </div>

          {items.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-baseline gap-2 px-3 py-1.5 text-[13px] hover:bg-[var(--color-surface-2)] lg:grid lg:grid-cols-[130px_170px_160px_1fr] lg:items-center lg:gap-3 ${
                i > 0 ? "border-t border-[var(--color-line)]" : ""
              }`}
            >
              {/* Timestamp */}
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft">
                {fmtTime(r.createdAt)}
              </span>

              {/* Utilizator + rol */}
              <span className="hidden min-w-0 items-center gap-1.5 lg:flex">
                <span className="truncate font-medium">{r.userName}</span>
                <span className={`shrink-0 rounded px-1 py-px text-[10px] font-semibold ${roleCls(r.userRole)}`}>
                  {roleLabel(r.userRole)}
                </span>
              </span>

              {/* Obiect */}
              <span className="hidden min-w-0 truncate text-ink-soft lg:block">
                {r.objectName ?? <span className="italic">—</span>}
              </span>

              {/* Acțiune */}
              <span className="min-w-0 flex-1 truncate lg:flex-none">
                <span className="font-medium lg:hidden">{r.userName}: </span>
                {rowSummary(r)}
                {r.objectName && (
                  <span className="ml-1 lg:hidden text-ink-soft">— {r.objectName}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Paginare */}
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
    </>
  );
}
