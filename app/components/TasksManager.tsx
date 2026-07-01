"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
import { dateKeyOf, formatTime } from "@/lib/date";
import { useToast } from "./toast";
import { IconTrash, IconX, IconChevronLeft, IconChevronRight, IconPencil } from "./icons";
import QuickSelect from "./QuickSelect";
import { quickCreateProject } from "@/app/actions/projects";
import type { CategoryLite } from "./types";

type HistoryRow = {
  id: string;
  fromStatus: Status | null;
  toStatus: Status | null;
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
  reminderIntervalMinutes: number | null;
  assigneeId: string | null;
  teamId: string | null;
  projectId: string | null;
  clientId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  assigneeName: string | null;
  teamName: string | null;
  projectName: string | null;
  clientName: string | null;
  creatorName: string;
  createdAt: string | Date;
  description: string | null;
};

const ST: Record<Status, { label: string; dot: string; badge: string }> = {
  NEW:         { label: "Nou",            dot: "bg-st-new",       badge: "bg-st-new/15 text-st-new" },
  ASSIGNED:    { label: "Asignat",        dot: "bg-st-new",       badge: "bg-st-new/15 text-st-new" },
  READ:        { label: "Citit",          dot: "bg-st-confirmed", badge: "bg-st-confirmed/15 text-st-confirmed" },
  IN_PROGRESS: { label: "În lucru",       dot: "bg-st-progress",  badge: "bg-st-progress/15 text-st-progress" },
  ON_HOLD:     { label: "În așteptare",   dot: "bg-st-noshow",    badge: "bg-st-noshow/15 text-st-noshow" },
  REVIEW:      { label: "În verificare",  dot: "bg-st-confirmed", badge: "bg-st-confirmed/15 text-st-confirmed" },
  DONE:        { label: "Finalizat",      dot: "bg-st-done",      badge: "bg-st-done/15 text-st-done" },
  CANCELLED:   { label: "Anulat",         dot: "bg-st-cancelled", badge: "bg-st-cancelled/15 text-st-cancelled" },
};

/** Grupează task-urile după status, păstrând ordinea în care apar primele. */
function groupByStatus(tasks: Task[]): [Status, Task[]][] {
  const order: Status[] = [];
  const map = new Map<Status, Task[]>();
  for (const t of tasks) {
    if (!map.has(t.status)) { map.set(t.status, []); order.push(t.status); }
    map.get(t.status)!.push(t);
  }
  return order.map((s) => [s, map.get(s)!]);
}
const TYPE_RO = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Work order" };
const PRIO_RO = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const STATUSES: Status[] = ["NEW", "ASSIGNED", "READ", "IN_PROGRESS", "ON_HOLD", "REVIEW", "DONE", "CANCELLED"];
const PROGRESS = [0, 25, 50, 75, 100];
const TZ = "Europe/Bucharest";

/** Formatează dueAt cu ora dacă nu e miezul nopții (00:00) în fusul Romania. */
function fmtDue(dueAt: string | Date): string {
  const d = new Date(dueAt);
  const parts = new Intl.DateTimeFormat("ro-RO", {
    timeZone: TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const h = get("hour"), m = get("minute");
  const date = `${get("day")}.${get("month")}.${get("year")}`;
  return h === "00" && m === "00" ? date : `${date} ${h}:${m}`;
}

type TaskFilters = {
  q: string; status: string; type: string; assignee: string;
  team: string; proj: string; client: string; prio: string;
  due: string; sort: string;
};

const fld =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";
const dlgInput =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function TasksManager({
  items,
  hasMore,
  page,
  totalPages,
  scope,
  users,
  teams,
  projects,
  clients = [],
  categories = [],
  filters,
  canCreate,
  canDelete,
  canEdit = false,
  canCreateProject = false,
  initialCreate,
  initialProjectId,
  initialOpenId,
  scopeOptions,
}: {
  items: Task[];
  hasMore: boolean;
  page: number;
  totalPages: number;
  scope: string;
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  clients?: Opt[];
  categories?: CategoryLite[];
  filters: TaskFilters;
  canCreate: boolean;
  canDelete: boolean;
  canEdit?: boolean;
  canCreateProject?: boolean;
  initialCreate?: "TASK" | "TICKET" | "WORK_ORDER";
  initialProjectId?: string;
  initialOpenId?: string;
  scopeOptions?: { key: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [navPending, startNav] = useTransition();
  const [createType, setCreateType] = useState<"TASK" | "TICKET" | "WORK_ORDER" | null>(
    initialCreate ?? (initialProjectId ? "TASK" : null),
  );
  const [tasks, setTasks] = useState(items);
  useEffect(() => setTasks(items), [items]);

  const [editTask, setEditTask] = useState<Task | null>(null);

  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [progressPending, setProgressPending] = useState<string | null>(null);

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
    if (openId === id) { setOpenId(null); return; }
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
        if (res?.error) { toast.error(res.error); return; }
        setCommentDraft((d) => ({ ...d, [id]: "" }));
        getTaskComments(id).then((rows) => setComments((c) => ({ ...c, [id]: rows as CommentRow[] })));
        toast.success("Comentariu adăugat");
      })
      .finally(() => setPostingComment((cur) => (cur === id ? null : cur)));
  }

  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  function setScope(newScope: string) {
    const usp = new URLSearchParams();
    if (newScope !== "mine") usp.set("scope", newScope);
    const qs = usp.toString();
    startNav(() => router.push(`/tasks${qs ? `?${qs}` : ""}`));
  }

  function buildUrl(patch: Partial<TaskFilters & { page: number }>) {
    const merged = { ...filters, ...patch } as Record<string, string | number | undefined>;
    const usp = new URLSearchParams();
    if (scope !== "mine") usp.set("scope", scope);
    for (const k of ["q", "status", "type", "assignee", "team", "proj", "client", "prio", "due", "sort"] as const) {
      const v = merged[k];
      if (v) usp.set(k, String(v));
    }
    const pageVal = "page" in patch ? Number(patch.page) : 1;
    if (pageVal > 1) usp.set("page", String(pageVal));
    const qs = usp.toString();
    return `/tasks${qs ? `?${qs}` : ""}`;
  }
  function setFilter(patch: Partial<TaskFilters>) { startNav(() => router.push(buildUrl(patch))); }
  function goPage(n: number) { startNav(() => router.push(buildUrl({ page: n }))); }

  function changeStatus(id: string, next: Status) {
    const prev = tasks;
    setStatusPending(id);
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, status: next } : t)));
    setTaskStatus(id, next).then((res) => {
      if (res?.error) { setTasks(prev); toast.error(res.error); }
      else {
        toast.success(`Status: ${ST[next].label}`);
        setHistory((h) => { if (!h[id]) return h; const { [id]: _, ...rest } = h; return rest; });
        if (openId === id) {
          getTaskHistory(id).then((rows) => setHistory((hh) => ({ ...hh, [id]: rows as HistoryRow[] }))).catch(() => {});
        }
      }
    }).finally(() => setStatusPending((cur) => (cur === id ? null : cur)));
  }

  function changeProgress(id: string, progress: number) {
    const prev = tasks;
    setProgressPending(id);
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, progress } : t)));
    setTaskProgress(id, progress).then((res) => {
      if (res?.error) { setTasks(prev); toast.error(res.error); }
      else toast.success(`Progres: ${progress}%`);
    }).finally(() => setProgressPending((cur) => (cur === id ? null : cur)));
  }

  function remove(id: string) {
    if (!confirm("Ștergi task-ul?")) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== id));
    deleteTask(id).then(() => toast.success("Șters")).catch(() => { setTasks(prev); toast.error("Ștergerea a eșuat"); });
  }

  const activeFilters = Boolean(
    filters.status || filters.type || filters.assignee || filters.team ||
    filters.proj || filters.client || filters.prio || filters.due || filters.q,
  );

  // Paginare: afișăm maxim 7 pagini vizibile în jurul paginii curente
  const pageButtons = buildPageButtons(page, totalPages);

  return (
    <>
      {scopeOptions && scopeOptions.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {scopeOptions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              className={`tap shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                scope === s.key ? "bg-brand text-white" : "card text-ink-soft"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Filtre ─────────────────────────────────────────── */}
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

        <select value={filters.assignee} onChange={(e) => setFilter({ assignee: e.target.value })} className={fld}>
          <option value="">Persoană: toți</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select value={filters.team} onChange={(e) => setFilter({ team: e.target.value })} className={fld}>
          <option value="">Echipă: toate</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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

        <select value={filters.due} onChange={(e) => setFilter({ due: e.target.value })} className={fld}>
          <option value="">Deadline: oricare</option>
          <option value="overdue">Expirate</option>
          <option value="today">Azi</option>
          <option value="tomorrow">Mâine</option>
          <option value="week">Săptămâna</option>
          <option value="month">Luna</option>
        </select>

        <select value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })} className={fld}>
          <option value="">Sortare: implicit</option>
          <option value="dueAsc">Deadline ↑</option>
          <option value="dueDesc">Deadline ↓</option>
        </select>

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

      {navPending && (
        <div className="mb-2 h-0.5 animate-pulse rounded-full bg-brand opacity-60" />
      )}

      {tasks.length === 0 ? (
        <div className="card grid place-items-center p-8 text-center text-sm text-ink-soft">
          {activeFilters ? "Niciun rezultat pentru filtrele selectate." : "Niciun task."}
        </div>
      ) : (
        <div className={`flex flex-col gap-0 transition-opacity duration-200 ${navPending ? "pointer-events-none opacity-50" : ""}`}>
          {groupByStatus(tasks).map(([status, group]) => (
            <div key={status} className="mb-3">
              {/* ── Header grup status ─────────────────────── */}
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${ST[status].badge}`}>
                  <span className={`size-2 rounded-full ${ST[status].dot}`} />
                  {ST[status].label.toUpperCase()}
                </span>
                <span className="text-xs text-ink-soft">{group.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
          {group.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleHistory(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {t.seq != null && (
                      <Link
                        href={`/tasks/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-brand hover:bg-brand/20"
                      >
                        #{t.seq}
                      </Link>
                    )}
                    <span className="min-w-0 truncate text-sm font-medium">{t.title}</span>
                    <span className="hidden shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-ink-soft sm:inline">
                      {TYPE_RO[t.type]}
                    </span>
                    <IconChevronRight
                      className={`size-3.5 shrink-0 text-ink-soft transition-transform ${openId === t.id ? "rotate-90" : ""}`}
                    />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1 truncate text-[11px] text-ink-soft">
                    {PRIO_RO[t.priority]}
                    {t.projectName && ` · ${t.projectName}`}
                    {(t.assigneeName || t.teamName) && ` · ${t.assigneeName ?? t.teamName}`}
                    {t.dueAt && ` · ${fmtDue(t.dueAt)}`}
                    {t.progress > 0 && ` · ${t.progress}%`}
                    {t.categoryName && (
                      <span className="inline-flex items-center gap-1">
                        {" · "}
                        <span className="size-1.5 rounded-full" style={{ background: t.categoryColor ?? "#6366f1" }} />
                        {t.categoryName}
                      </span>
                    )}
                  </p>
                </button>
                <select
                  value={t.progress}
                  onChange={(e) => changeProgress(t.id, Number(e.target.value))}
                  disabled={progressPending === t.id}
                  title="Progres"
                  className="hidden h-8 w-16 shrink-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-1 text-[11px] outline-none focus:border-brand disabled:opacity-50 sm:block"
                >
                  {PROGRESS.map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
                <StatusDropdown
                  status={t.status}
                  pending={statusPending === t.id}
                  onChange={(s) => changeStatus(t.id, s)}
                />
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
                  <Timeline rows={history[t.id]} loading={loadingHist === t.id} createdAt={t.createdAt} creatorName={t.creatorName} />
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
            </div>
          ))}
        </div>
      )}

      {/* ── Paginare numerică ──────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => goPage(page - 1)}
            className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-ink-soft hover:bg-[var(--color-surface-2)] disabled:opacity-40"
            aria-label="Anterior"
          >
            <IconChevronLeft className="size-4" />
          </button>
          {pageButtons.map((b, i) =>
            b === "…" ? (
              <span key={`ellipsis-${i}`} className="flex h-9 w-6 items-center justify-center text-sm text-ink-soft">…</span>
            ) : (
              <button
                key={b}
                onClick={() => goPage(Number(b))}
                className={`tap h-9 min-w-[36px] rounded-lg px-2.5 text-sm font-medium ${
                  Number(b) === page
                    ? "bg-brand text-white"
                    : "border border-[var(--color-line)] text-ink hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {b}
              </button>
            ),
          )}
          <button
            disabled={!hasMore}
            onClick={() => goPage(page + 1)}
            className="tap grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-ink-soft hover:bg-[var(--color-surface-2)] disabled:opacity-40"
            aria-label="Următor"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>
      )}

      {createType && (
        <CreateDialog
          initialType={createType}
          users={users}
          teams={teams}
          projects={projects}
          categories={categories}
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
          categories={categories}
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

function StatusDropdown({
  status,
  pending,
  onChange,
}: {
  status: Status;
  pending: boolean;
  onChange: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

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
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(rect.width, 144),
      });
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
        className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] font-semibold transition-opacity disabled:opacity-50 ${ST[status].badge}`}
      >
        {ST[status].label}
      </button>
      {open && mounted && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-xl"
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-medium hover:bg-[var(--color-surface-2)] ${s === status ? "font-bold" : ""}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${ST[s].dot}`} />
              <span className={s === status ? "text-ink" : "text-ink-soft"}>{ST[s].label}</span>
              {s === status && <span className="ml-auto text-[10px] text-brand">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Generează lista de butoane de paginare cu „…" pentru spații mari. */
function buildPageButtons(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let i = Math.max(2, current - 2); i <= Math.min(total - 1, current + 2); i++) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

function Timeline({
  rows, loading, createdAt, creatorName,
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
          {(rows ?? []).filter((r) => r.toStatus).map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${ST[r.toStatus!]?.dot ?? "bg-st-new"}`} />
              <div className="min-w-0 text-[11px]">
                <span className="font-medium">
                  {r.fromStatus ? `${ST[r.fromStatus]?.label ?? r.fromStatus} → ` : ""}
                  {ST[r.toStatus!]?.label ?? r.toStatus}
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
  WEB: "", TELEGRAM: " · via Telegram", VOICE: " · din voce",
};

function Comments({
  rows, draft, posting, onDraftChange, onSubmit,
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
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex items-end gap-2">
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

function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: CategoryLite[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-soft">Categorie</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className={`h-7 rounded-full px-3 text-xs font-medium border transition-colors ${
            !value
              ? "border-brand bg-brand text-white"
              : "border-[var(--color-line)] text-ink-soft hover:border-brand"
          }`}
        >
          Fără
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium border transition-colors ${
              value === c.id
                ? "border-brand bg-brand/10 text-brand"
                : "border-[var(--color-line)] text-ink-soft hover:border-brand"
            }`}
          >
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
      <input type="hidden" name="categoryId" value={value} />
    </div>
  );
}

function EditDialog({
  task, users, teams, projects, categories, onClose, onSaved,
}: {
  task: Task;
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  categories: CategoryLite[];
  onClose: () => void;
  onSaved: (updated: Partial<Task> & { id: string }) => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<TaskState, FormData>(updateTaskAction, undefined);
  const [categoryId, setCategoryId] = useState(task.categoryId ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [title, setTitle] = useState(task.title);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Salvat");
      onSaved({ id: task.id, title, description: description || null });
    } else if (state?.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const dueDate = task.dueAt ? dateKeyOf(new Date(task.dueAt), TZ) : "";
  const dueTimeRaw = task.dueAt ? formatTime(new Date(task.dueAt), TZ) : "";
  const dueTime = dueTimeRaw !== "00:00" ? dueTimeRaw : "";
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
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titlu *"
            required
            autoFocus
            className={dlgInput}
          />
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descriere"
            rows={3}
            className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
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
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className={dlgInput}>
              <option value="">Fără persoană</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="teamId" defaultValue={task.teamId ?? ""} className={dlgInput}>
              <option value="">Fără echipă</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Scadent (opțional)</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="date" name="dueDate" defaultValue={dueDate} className={dlgInput} />
              <input type="time" name="dueTime" defaultValue={dueTime} placeholder="Ora (opțional)" className={dlgInput} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Reamintire periodică</label>
            <select name="reminderIntervalMinutes" defaultValue={task.reminderIntervalMinutes ?? 0} className={dlgInput}>
              <option value={0}>Niciodată</option>
              <option value={10}>La fiecare 10 min</option>
              <option value={30}>La fiecare 30 min</option>
              <option value={60}>La fiecare 1h</option>
              <option value={180}>La fiecare 3h</option>
              <option value={360}>La fiecare 6h</option>
              <option value={720}>La fiecare 12h</option>
              <option value={1440}>La fiecare 24h</option>
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

function CreateDialog({
  initialType, users, teams, projects, categories, canCreateProject, initialProjectId, onClose, onCreated,
}: {
  initialType: "TASK" | "TICKET" | "WORK_ORDER";
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  categories: CategoryLite[];
  canCreateProject: boolean;
  initialProjectId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<TaskState, FormData>(createTaskAction, undefined);
  const [categoryId, setCategoryId] = useState("");
  useEffect(() => {
    if (state?.ok) { toast.success("Creat"); onCreated(); onClose(); }
    else if (state?.error) toast.error(state.error);
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
          <div className="grid gap-2 sm:grid-cols-2">
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
          <div className="grid gap-2 sm:grid-cols-2">
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
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="date" name="dueDate" className={dlgInput} />
              <input type="time" name="dueTime" placeholder="Ora (opțional)" className={dlgInput} />
            </div>
          </div>
          <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Reamintire periodică</label>
            <select name="reminderIntervalMinutes" defaultValue={0} className={dlgInput}>
              <option value={0}>Niciodată</option>
              <option value={10}>La fiecare 10 min</option>
              <option value={30}>La fiecare 30 min</option>
              <option value={60}>La fiecare 1h</option>
              <option value={180}>La fiecare 3h</option>
              <option value={360}>La fiecare 6h</option>
              <option value={720}>La fiecare 12h</option>
              <option value={1440}>La fiecare 24h</option>
            </select>
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
