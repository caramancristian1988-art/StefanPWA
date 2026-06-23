"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createTaskAction,
  updateTaskAction,
  setTaskStatus,
  setTaskProgress,
  deleteTask,
  getTaskHistory,
  getTaskComments,
  addTaskCommentAction,
  type TaskState,
} from "@/app/actions/tasks";
import { useToast } from "./toast";
import { IconTrash, IconX, IconChevronLeft, IconChevronRight, IconPencil } from "./icons";
import QuickSelect from "./QuickSelect";
import { quickCreateProject } from "@/app/actions/projects";

type HistoryRow = {
  id: string;
  fromStatus: Status | null;
  toStatus: Status;
  note: string | null;
  createdAt: string | Date;
  userName: string;
};

type CommentRow = {
  id: string;
  body: string;
  source: "WEB" | "TELEGRAM" | "VOICE";
  createdAt: string | Date;
  userName: string;
};

type Opt = { id: string; name: string };
type Status = "NEW" | "ASSIGNED" | "READ" | "IN_PROGRESS" | "ON_HOLD" | "REVIEW" | "DONE" | "CANCELLED";
type Task = {
  id: string;
  seq: number | null;
  type: "TASK" | "TICKET" | "WORK_ORDER";
  title: string;
  status: Status;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  progress: number;
  dueAt: string | Date | null;
  assigneeId: string | null;
  teamId: string | null;
  projectId: string | null;
  clientId: string | null;
  assigneeName: string | null;
  teamName: string | null;
  projectName: string | null;
  clientName: string | null;
  creatorName: string;
  createdAt: string | Date;
  description: string | null;
};

const ST: Record<Status, { label: string; dot: string }> = {
  NEW: { label: "Nou", dot: "bg-st-new" },
  ASSIGNED: { label: "Asignat", dot: "bg-st-new" },
  READ: { label: "Citit", dot: "bg-st-confirmed" },
  IN_PROGRESS: { label: "În lucru", dot: "bg-st-progress" },
  ON_HOLD: { label: "În așteptare", dot: "bg-st-noshow" },
  REVIEW: { label: "În verificare", dot: "bg-st-confirmed" },
  DONE: { label: "Finalizat", dot: "bg-st-done" },
  CANCELLED: { label: "Anulat", dot: "bg-st-cancelled" },
};
const TYPE_RO = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Work order" };
const PRIO_RO = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const STATUSES: Status[] = ["NEW", "ASSIGNED", "READ", "IN_PROGRESS", "ON_HOLD", "REVIEW", "DONE", "CANCELLED"];
const PROGRESS = [0, 25, 50, 75, 100];

type TaskFilters = {
  q: string; status: string; type: string; assignee: string;
  proj: string; client: string; prio: string; due: string;
};

const fld =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";
const dlgInput =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function TasksManager({
  items,
  hasMore,
  page,
  scope,
  users,
  teams,
  projects,
  clients = [],
  filters,
  canCreate,
  canDelete,
  canEdit = false,
  canCreateProject = false,
  initialCreate,
  initialProjectId,
  initialOpenId,
}: {
  items: Task[];
  hasMore: boolean;
  page: number;
  scope: string;
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  clients?: Opt[];
  filters: TaskFilters;
  canCreate: boolean;
  canDelete: boolean;
  canEdit?: boolean;
  canCreateProject?: boolean;
  initialCreate?: "TASK" | "TICKET" | "WORK_ORDER";
  initialProjectId?: string;
  initialOpenId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [createType, setCreateType] = useState<"TASK" | "TICKET" | "WORK_ORDER" | null>(
    initialCreate ?? (initialProjectId ? "TASK" : null),
  );
  const [tasks, setTasks] = useState(items);
  useEffect(() => setTasks(items), [items]);

  const [editTask, setEditTask] = useState<Task | null>(null);

  // Istoric (timeline) + comentarii per task — expandare + cache lazy
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  useEffect(() => {
    if (initialOpenId) {
      getTaskHistory(initialOpenId)
        .then((rows) => setHistory((h) => ({ ...h, [initialOpenId]: rows as HistoryRow[] })))
        .catch(() => {});
      getTaskComments(initialOpenId)
        .then((rows) => setComments((c) => ({ ...c, [initialOpenId]: rows as CommentRow[] })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [loadingHist, setLoadingHist] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);

  function toggleHistory(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!history[id]) {
      setLoadingHist(id);
      getTaskHistory(id)
        .then((rows) => setHistory((h) => ({ ...h, [id]: rows as HistoryRow[] })))
        .catch(() => toast.error("Nu am putut încărca istoricul"))
        .finally(() => setLoadingHist((cur) => (cur === id ? null : cur)));
    }
    if (!comments[id]) {
      getTaskComments(id)
        .then((rows) => setComments((c) => ({ ...c, [id]: rows as CommentRow[] })))
        .catch(() => toast.error("Nu am putut încărca comentariile"));
    }
  }

  function postComment(id: string) {
    const body = (commentDraft[id] ?? "").trim();
    if (!body) return;
    setPostingComment(id);
    addTaskCommentAction(id, body)
      .then((res) => {
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        setCommentDraft((d) => ({ ...d, [id]: "" }));
        getTaskComments(id).then((rows) => setComments((c) => ({ ...c, [id]: rows as CommentRow[] })));
        toast.success("Comentariu adăugat");
      })
      .finally(() => setPostingComment((cur) => (cur === id ? null : cur)));
  }

  // Filtrare 100% pe server: filtrele se reflectă în URL, pagina re-cere datele.
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  function buildUrl(patch: Partial<TaskFilters & { page: number }>) {
    const merged = { ...filters, ...patch } as Record<string, string | number | undefined>;
    const usp = new URLSearchParams();
    if (scope !== "mine") usp.set("scope", scope);
    for (const k of ["q", "status", "type", "assignee", "proj", "client", "prio", "due"] as const) {
      const v = merged[k];
      if (v) usp.set(k, String(v));
    }
    // resetăm pagina la 1 la schimbarea unui filtru, dacă nu s-a cerut explicit altă pagină
    const pageVal = "page" in patch ? Number(patch.page) : 1;
    if (pageVal > 1) usp.set("page", String(pageVal));
    const qs = usp.toString();
    return `/tasks${qs ? `?${qs}` : ""}`;
  }
  function setFilter(patch: Partial<TaskFilters>) {
    router.push(buildUrl(patch));
  }

  function goPage(n: number) {
    router.push(buildUrl({ page: n }));
  }

  function changeStatus(id: string, next: Status) {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, status: next } : t)));
    setTaskStatus(id, next).then((res) => {
      if (res?.error) {
        setTasks(prev);
        toast.error(res.error);
      } else {
        toast.success(`Status: ${ST[next].label}`);
        // istoricul s-a schimbat → invalidează cache-ul ca să se reîncarce la deschidere
        setHistory((h) => {
          if (!h[id]) return h;
          const { [id]: _drop, ...rest } = h;
          return rest;
        });
        if (openId === id) {
          getTaskHistory(id)
            .then((rows) => setHistory((hh) => ({ ...hh, [id]: rows as HistoryRow[] })))
            .catch(() => {});
        }
      }
    });
  }

  function changeProgress(id: string, progress: number) {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, progress } : t)));
    setTaskProgress(id, progress).then((res) => {
      if (res?.error) {
        setTasks(prev);
        toast.error(res.error);
      } else {
        toast.success(`Progres: ${progress}%`);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Ștergi task-ul?")) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== id));
    deleteTask(id)
      .then(() => toast.success("Șters"))
      .catch(() => {
        setTasks(prev);
        toast.error("Ștergerea a eșuat");
      });
  }

  const activeFilters = Boolean(
    filters.status || filters.type || filters.assignee || filters.proj ||
    filters.client || filters.prio || filters.due || filters.q,
  );

  return (
    <>
      {/* Filtre (pe server — reflectate în URL) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); setFilter({ q: searchInput }); }}
          className="flex min-w-40 flex-1 items-center"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută… (Enter)"
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
          />
        </form>
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className={fld}>
          <option value="">Status: toate</option>
          {STATUSES.map((s) => <option key={s} value={s}>{ST[s].label}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} className={fld}>
          <option value="">Tip: toate</option>
          <option value="TASK">Task</option>
          <option value="TICKET">Tichet</option>
          <option value="WORK_ORDER">Work order</option>
        </select>
        <select value={filters.assignee} onChange={(e) => setFilter({ assignee: e.target.value })} className={fld}>
          <option value="">Persoană: toți</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filters.proj} onChange={(e) => setFilter({ proj: e.target.value })} className={fld}>
          <option value="">Proiect: toate</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filters.client} onChange={(e) => setFilter({ client: e.target.value })} className={fld}>
          <option value="">Client: toți</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.prio} onChange={(e) => setFilter({ prio: e.target.value })} className={fld}>
          <option value="">Prioritate: toate</option>
          <option value="LOW">Scăzută</option>
          <option value="MEDIUM">Medie</option>
          <option value="HIGH">Ridicată</option>
          <option value="URGENT">Urgentă</option>
        </select>
        <input type="date" value={filters.due} onChange={(e) => setFilter({ due: e.target.value })} title="Scadent până la" className={fld} />
        {activeFilters && (
          <button
            onClick={() => router.push(scope !== "mine" ? `/tasks?scope=${scope}` : "/tasks")}
            className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            Resetează
          </button>
        )}
      </div>

      {canCreate && (
        <div className="mb-3 flex gap-2">
          <button onClick={() => setCreateType("TASK")} className="tap h-10 flex-1 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-strong">
            + Task nou
          </button>
          <button onClick={() => setCreateType("TICKET")} className="tap h-10 flex-1 rounded-xl bg-[var(--color-surface-2)] text-sm font-semibold hover:bg-brand-soft">
            + Tichet nou
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="card grid place-items-center p-8 text-center text-sm text-ink-soft">
          {activeFilters ? "Niciun rezultat pentru filtre." : "Niciun task."}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <span className={`size-2.5 shrink-0 rounded-full ${ST[t.status].dot}`} title={ST[t.status].label} />
                <button
                  type="button"
                  onClick={() => toggleHistory(t.id)}
                  className="min-w-0 flex-1 text-left"
                  title="Vezi istoricul de status"
                >
                  <div className="flex items-center gap-2">
                    {t.seq != null && (
                      <Link
                        href={`/tasks/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-brand hover:bg-brand/20"
                        title="Pagina completă a task-ului"
                      >
                        #{t.seq}
                      </Link>
                    )}
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <span className="hidden shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-ink-soft sm:inline">
                      {TYPE_RO[t.type]}
                    </span>
                    <IconChevronRight
                      className={`size-3.5 shrink-0 text-ink-soft transition-transform ${openId === t.id ? "rotate-90" : ""}`}
                    />
                  </div>
                  <p className="truncate text-[11px] text-ink-soft">
                    {PRIO_RO[t.priority]}
                    {t.projectName && ` · ${t.projectName}`}
                    {(t.assigneeName || t.teamName) && ` · ${t.assigneeName ?? t.teamName}`}
                    {t.dueAt && ` · ${new Date(t.dueAt).toLocaleDateString("ro-RO")}`}
                    {t.progress > 0 && ` · ${t.progress}%`}
                  </p>
                </button>
                <select
                  value={t.progress}
                  onChange={(e) => changeProgress(t.id, Number(e.target.value))}
                  title="Progres"
                  className="hidden h-8 w-16 shrink-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-1 text-[11px] outline-none focus:border-brand sm:block"
                >
                  {PROGRESS.map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
                <select
                  value={t.status}
                  onChange={(e) => changeStatus(t.id, e.target.value as Status)}
                  className="h-8 w-28 shrink-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-[11px] outline-none focus:border-brand"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{ST[s].label}</option>)}
                </select>
                {canEdit && (
                  <button onClick={() => setEditTask(t)} className="tap grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] text-ink-soft hover:bg-[var(--color-surface-2)]" title="Editează">
                    <IconPencil className="size-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => remove(t.id)} className="tap grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] text-st-cancelled hover:bg-[var(--color-surface-2)]" title="Șterge">
                    <IconTrash className="size-3.5" />
                  </button>
                )}
              </div>
              {openId === t.id && (
                <>
                  {t.description && (
                    <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
                      <p className="mb-1 text-[11px] font-semibold text-ink-soft">📝 Descriere</p>
                      <p className="whitespace-pre-wrap text-[12px]">{t.description}</p>
                    </div>
                  )}
                  <Timeline
                    rows={history[t.id]}
                    loading={loadingHist === t.id}
                    createdAt={t.createdAt}
                    creatorName={t.creatorName}
                  />
                  <Comments
                    rows={comments[t.id]}
                    draft={commentDraft[t.id] ?? ""}
                    posting={postingComment === t.id}
                    onDraftChange={(v) => setCommentDraft((d) => ({ ...d, [t.id]: v }))}
                    onSubmit={() => postComment(t.id)}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => goPage(page - 1)} className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            <IconChevronLeft className="size-4" /> Anterior
          </button>
          <span className="text-sm text-ink-soft">Pagina {page}</span>
          <button disabled={!hasMore} onClick={() => goPage(page + 1)} className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            Următor <IconChevronRight className="size-4" />
          </button>
        </div>
      )}

      {createType && (
        <CreateDialog
          initialType={createType}
          users={users}
          teams={teams}
          projects={projects}
          canCreateProject={canCreateProject}
          initialProjectId={initialProjectId}
          onClose={() => setCreateType(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {editTask && (
        <EditDialog
          task={editTask}
          users={users}
          teams={teams}
          projects={projects}
          onClose={() => setEditTask(null)}
          onSaved={(updated) => {
            setTasks((cur) => cur.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
            setEditTask(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Timeline({
  rows,
  loading,
  createdAt,
  creatorName,
}: {
  rows: HistoryRow[] | undefined;
  loading: boolean;
  createdAt: string | Date;
  creatorName: string;
}) {
  const fmt = (d: string | Date) => new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
      {loading && !rows ? (
        <p className="text-[11px] text-ink-soft">Se încarcă istoricul…</p>
      ) : (
        <ol className="flex flex-col gap-2">
          <li className="flex items-start gap-2.5">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-st-new" />
            <div className="min-w-0 text-[11px]">
              <span className="font-medium">Creat</span>
              <span className="text-ink-soft"> · {creatorName} · {fmt(createdAt)}</span>
            </div>
          </li>
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${ST[r.toStatus]?.dot ?? "bg-st-new"}`} />
              <div className="min-w-0 text-[11px]">
                <span className="font-medium">
                  {r.fromStatus ? `${ST[r.fromStatus]?.label ?? r.fromStatus} → ` : ""}
                  {ST[r.toStatus]?.label ?? r.toStatus}
                </span>
                <span className="text-ink-soft"> · {r.userName} · {fmt(r.createdAt)}</span>
                {r.note && <span className="text-ink-soft"> · {r.note}</span>}
              </div>
            </li>
          ))}
          {rows && rows.length === 0 && (
            <li className="text-[11px] text-ink-soft">Niciun alt eveniment încă.</li>
          )}
        </ol>
      )}
    </div>
  );
}

const SOURCE_LABEL: Record<CommentRow["source"], string> = {
  WEB: "",
  TELEGRAM: " · via Telegram",
  VOICE: " · din voce",
};

function Comments({
  rows,
  draft,
  posting,
  onDraftChange,
  onSubmit,
}: {
  rows: CommentRow[] | undefined;
  draft: string;
  posting: boolean;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const fmt = (d: string | Date) => new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
      <p className="mb-2 text-[11px] font-semibold text-ink-soft">💬 Comentarii</p>
      <div className="mb-2 flex flex-col gap-2">
        {rows === undefined ? (
          <p className="text-[11px] text-ink-soft">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-ink-soft">Niciun comentariu încă.</p>
        ) : (
          rows.map((c) => (
            <div key={c.id} className="text-[11px]">
              <span className="font-medium">{c.userName}</span>
              <span className="text-ink-soft"> · {fmt(c.createdAt)}{SOURCE_LABEL[c.source]}</span>
              <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Scrie un comentariu…"
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={posting || !draft.trim()}
          className="tap h-8 shrink-0 rounded-lg bg-brand px-3 text-[11px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {posting ? "…" : "Trimite"}
        </button>
      </form>
    </div>
  );
}

function EditDialog({
  task,
  users,
  teams,
  projects,
  onClose,
  onSaved,
}: {
  task: Task;
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  onClose: () => void;
  onSaved: (updated: Partial<Task> & { id: string }) => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<TaskState, FormData>(updateTaskAction, undefined);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Salvat");
      onSaved({ id: task.id });
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const dueVal = task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "";
  const seqLabel = task.seq != null ? ` #${task.seq}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Editează{seqLabel}</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={task.id} />
          <input name="title" defaultValue={task.title} placeholder="Titlu *" required autoFocus className={dlgInput} />
          <textarea name="description" placeholder="Descriere" rows={3} className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-brand" />
          <select name="priority" defaultValue={task.priority} className={dlgInput}>
            <option value="LOW">Prioritate scăzută</option>
            <option value="MEDIUM">Prioritate medie</option>
            <option value="HIGH">Prioritate ridicată</option>
            <option value="URGENT">Urgentă</option>
          </select>
          <select name="projectId" defaultValue={task.projectId ?? ""} className={dlgInput}>
            <option value="">Fără proiect</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className={dlgInput}>
              <option value="">Fără persoană</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="teamId" defaultValue={task.teamId ?? ""} className={dlgInput}>
              <option value="">Fără echipă</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Scadent (opțional)</label>
            <input type="date" name="dueAt" defaultValue={dueVal} className={dlgInput} />
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

function CreateDialog({
  initialType,
  users,
  teams,
  projects,
  canCreateProject,
  initialProjectId,
  onClose,
  onCreated,
}: {
  initialType: "TASK" | "TICKET" | "WORK_ORDER";
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  canCreateProject: boolean;
  initialProjectId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<TaskState, FormData>(createTaskAction, undefined);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Creat");
      onCreated();
      onClose();
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const title = initialType === "TICKET" ? "Tichet nou" : initialType === "WORK_ORDER" ? "Work order nou" : "Task nou";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>
        <form action={action} className="flex flex-col gap-3">
          <input name="title" placeholder="Titlu *" required autoFocus className={dlgInput} />
          <textarea name="description" placeholder="Descriere" rows={3} className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-brand" />
          <div className="grid grid-cols-2 gap-3">
            <select name="type" defaultValue={initialType} className={dlgInput}>
              <option value="TASK">Task</option>
              <option value="TICKET">Tichet</option>
              <option value="WORK_ORDER">Work order</option>
            </select>
            <select name="priority" defaultValue="MEDIUM" className={dlgInput}>
              <option value="LOW">Prioritate scăzută</option>
              <option value="MEDIUM">Prioritate medie</option>
              <option value="HIGH">Prioritate ridicată</option>
              <option value="URGENT">Urgentă</option>
            </select>
          </div>
          <QuickSelect
            name="projectId"
            options={projects}
            placeholder="Fără proiect (se asignează ție)"
            optionPrefix="Proiect: "
            canCreate={canCreateProject}
            createLabel="proiect"
            onQuickCreate={quickCreateProject}
            defaultValue={initialProjectId ?? ""}
          />
          <div className="grid grid-cols-2 gap-3">
            <select name="assigneeId" defaultValue="" className={dlgInput}>
              <option value="">Asignează persoană…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="teamId" defaultValue="" className={dlgInput}>
              <option value="">…sau echipă</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Scadent (opțional)</label>
            <input type="date" name="dueAt" className={dlgInput} />
          </div>
          {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
          <button type="submit" disabled={pending} className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Creează"}
          </button>
        </form>
      </div>
    </div>
  );
}
