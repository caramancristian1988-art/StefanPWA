"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createProject,
  updateProject,
  deleteProject,
  type ProjectState,
} from "@/app/actions/projects";
import { useToast } from "./toast";
import { IconX, IconPencil, IconTrash, IconPlus, IconChevronLeft, IconChevronRight } from "./icons";

type Opt = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
  clientId: string | null;
  assigneeId: string | null;
  teamId: string | null;
  taskCount: number;
};

const STATUS_RO = { ACTIVE: "Activ", ON_HOLD: "În așteptare", DONE: "Finalizat", ARCHIVED: "Arhivat" };
const input =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function ProjectsManager({
  projects,
  users,
  teams,
  clients,
  page = 1,
  hasMore = false,
  filters = { q: "", status: "" },
  openCreate,
}: {
  projects: Project[];
  users: Opt[];
  teams: Opt[];
  clients: Opt[];
  page?: number;
  hasMore?: boolean;
  filters?: { q: string; status: string };
  openCreate?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(projects);
  useEffect(() => setRows(projects), [projects]);
  const [dialog, setDialog] = useState<{ open: boolean; project: Project | null }>({
    open: openCreate ? true : false,
    project: null,
  });

  // Filtrare pe server (reflectată în URL)
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  function buildUrl(patch: { q?: string; status?: string; page?: number }) {
    const merged = { q: filters.q, status: filters.status, ...patch } as Record<string, string | number | undefined>;
    const usp = new URLSearchParams();
    if (merged.q) usp.set("q", String(merged.q));
    if (merged.status) usp.set("status", String(merged.status));
    const pageVal = "page" in patch ? Number(patch.page) : 1;
    if (pageVal > 1) usp.set("page", String(pageVal));
    const qs = usp.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  }
  const activeFilters = Boolean(filters.q || filters.status);

  const nameOf = (id: string | null, list: Opt[]) => list.find((o) => o.id === id)?.name;

  function remove(id: string) {
    if (!confirm("Ștergi proiectul? Task-urile rămân, dar fără proiect.")) return;
    const prev = rows;
    setRows((r) => r.filter((p) => p.id !== id)); // optimistic
    deleteProject(id)
      .then(() => toast.success("Proiect șters"))
      .catch(() => {
        setRows(prev);
        toast.error("Ștergerea a eșuat");
      });
  }

  return (
    <>
      <button
        onClick={() => setDialog({ open: true, project: null })}
        className="tap mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong"
      >
        + Proiect nou
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); router.push(buildUrl({ q: searchInput })); }}
          className="flex min-w-40 flex-1 items-center"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută proiect… (Enter)"
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
          />
        </form>
        <select value={filters.status} onChange={(e) => router.push(buildUrl({ status: e.target.value }))} className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand">
          <option value="">Status: toate</option>
          <option value="ACTIVE">Activ</option>
          <option value="ON_HOLD">În așteptare</option>
          <option value="DONE">Finalizat</option>
          <option value="ARCHIVED">Arhivat</option>
        </select>
        {activeFilters && (
          <button onClick={() => router.push("/projects")} className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]">
            Resetează
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
          {activeFilters ? "Niciun rezultat pentru filtre." : "Niciun proiect."}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((p) => (
            <div key={p.id} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-xs text-ink-soft">
                  {STATUS_RO[p.status]} · {p.taskCount} task-uri
                  {p.clientId && ` · client ${nameOf(p.clientId, clients) ?? "?"}`}
                  {p.assigneeId && ` · → ${nameOf(p.assigneeId, users) ?? "?"}`}
                  {p.teamId && ` · echipă ${nameOf(p.teamId, teams) ?? "?"}`}
                </p>
              </div>
              <Link href={`/tasks?create=task&project=${p.id}`} className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--color-line)] px-2.5 text-xs font-medium text-brand hover:bg-brand-soft" title="Adaugă task în proiect">
                <IconPlus className="size-3.5" /> Task
              </Link>
              <button onClick={() => setDialog({ open: true, project: p })} className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] hover:bg-[var(--color-surface-2)]" title="Editează">
                <IconPencil className="size-4" />
              </button>
              <button onClick={() => remove(p.id)} className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-st-cancelled hover:bg-[var(--color-surface-2)]" title="Șterge">
                <IconTrash className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => router.push(buildUrl({ page: page - 1 }))}
            className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            <IconChevronLeft className="size-4" /> Anterior
          </button>
          <span className="text-sm text-ink-soft">Pagina {page}</span>
          <button
            disabled={!hasMore}
            onClick={() => router.push(buildUrl({ page: page + 1 }))}
            className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            Următor <IconChevronRight className="size-4" />
          </button>
        </div>
      )}

      {dialog.open && (
        <ProjectDialog
          project={dialog.project}
          users={users}
          teams={teams}
          clients={clients}
          onClose={() => setDialog({ open: false, project: null })}
        />
      )}
    </>
  );
}

function ProjectDialog({
  project,
  users,
  teams,
  clients,
  onClose,
}: {
  project: Project | null;
  users: Opt[];
  teams: Opt[];
  clients: Opt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const action = project ? updateProject : createProject;
  const [state, formAction, pending] = useActionState<ProjectState, FormData>(action, undefined);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{project ? "Editează proiect" : "Proiect nou"}</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>
        <form action={formAction} className="flex flex-col gap-3">
          {project && <input type="hidden" name="id" value={project.id} />}
          <input name="name" defaultValue={project?.name ?? ""} placeholder="Nume proiect *" required className={input} />
          <textarea name="description" defaultValue={project?.description ?? ""} placeholder="Descriere" rows={3} className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-brand" />
          <select name="status" defaultValue={project?.status ?? "ACTIVE"} className={input}>
            <option value="ACTIVE">Activ</option>
            <option value="ON_HOLD">În așteptare</option>
            <option value="DONE">Finalizat</option>
            <option value="ARCHIVED">Arhivat</option>
          </select>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Client (opțional — pentru facturare)</label>
            <select name="clientId" defaultValue={project?.clientId ?? ""} className={input}>
              <option value="">Fără client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-ink-soft">Asignarea proiectului se moștenește automat de task-urile noi:</p>
          <div className="grid grid-cols-2 gap-3">
            <select name="assigneeId" defaultValue={project?.assigneeId ?? ""} className={input}>
              <option value="">Persoană…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="teamId" defaultValue={project?.teamId ?? ""} className={input}>
              <option value="">…sau echipă</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
          <button type="submit" disabled={pending} className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Salvează"}
          </button>
        </form>
      </div>
    </div>
  );
}
