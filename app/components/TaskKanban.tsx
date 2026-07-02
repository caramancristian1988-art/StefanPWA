"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { setTaskStatus } from "@/app/actions/tasks";
import { useToast } from "./toast";

type Opt = { id: string; name: string };
type Status = "NEW" | "ASSIGNED" | "READ" | "IN_PROGRESS" | "ON_HOLD" | "REVIEW" | "DONE" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskType = "TASK" | "TICKET" | "WORK_ORDER";

type Task = {
  id: string;
  seq: number | null;
  type: TaskType;
  title: string;
  status: Status;
  priority: Priority;
  progress: number;
  dueAt: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
  teamId: string | null;
  teamName: string | null;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
};

const COLUMNS: { status: Status; label: string; dot: string }[] = [
  { status: "NEW", label: "Nou", dot: "bg-st-new" },
  { status: "ASSIGNED", label: "Asignat", dot: "bg-st-new" },
  { status: "READ", label: "Citit", dot: "bg-st-confirmed" },
  { status: "IN_PROGRESS", label: "În lucru", dot: "bg-st-progress" },
  { status: "ON_HOLD", label: "În așteptare", dot: "bg-st-noshow" },
  { status: "REVIEW", label: "În verificare", dot: "bg-st-confirmed" },
  { status: "DONE", label: "Finalizat", dot: "bg-st-done" },
  { status: "CANCELLED", label: "Anulat", dot: "bg-st-cancelled" },
];

const LABEL: Record<Status, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.status, c.label]),
) as Record<Status, string>;

const TYPE_RO: Record<TaskType, string> = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Comandă" };
const PRIO_RO: Record<Priority, string> = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const PRIO_CLR: Record<Priority, string> = {
  LOW: "text-ink-soft",
  MEDIUM: "text-ink-soft",
  HIGH: "text-st-noshow",
  URGENT: "text-st-cancelled",
};

const DEADLINE_OPTS = [
  { value: "", label: "Orice termen" },
  { value: "overdue", label: "Depășit" },
  { value: "today", label: "Azi" },
  { value: "tomorrow", label: "Mâine" },
  { value: "week", label: "Săptămâna aceasta" },
  { value: "month", label: "Luna aceasta" },
  { value: "none", label: "Fără termen" },
];

const QUICK = [
  { key: "today", label: "Azi" },
  { key: "tomorrow", label: "Mâine" },
  { key: "week", label: "Săptămâna" },
  { key: "month", label: "Luna" },
] as const;

const fld =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";

function matchesDue(dueAt: Date | null, filter: string): boolean {
  if (!filter) return true;
  if (filter === "none") return dueAt === null;
  if (!dueAt) return false;
  const d = new Date(dueAt);
  const now = new Date();
  if (filter === "overdue") return d < now;

  const s0 = new Date(); s0.setHours(0, 0, 0, 0);
  const e0 = new Date(s0); e0.setDate(e0.getDate() + 1);
  if (filter === "today") return d >= s0 && d < e0;

  const s1 = new Date(s0); s1.setDate(s1.getDate() + 1);
  const e1 = new Date(s1); e1.setDate(e1.getDate() + 1);
  if (filter === "tomorrow") return d >= s1 && d < e1;

  if (filter === "week") {
    const ws = new Date(s0);
    const day = ws.getDay();
    ws.setDate(ws.getDate() - (day === 0 ? 6 : day - 1)); // Monday
    const we = new Date(ws); we.setDate(we.getDate() + 7);
    return d >= ws && d < we;
  }
  if (filter === "month") {
    const ms = new Date(s0); ms.setDate(1);
    const me = new Date(ms); me.setMonth(me.getMonth() + 1);
    return d >= ms && d < me;
  }
  return true;
}

export default function TaskKanban({
  items,
  users,
  teams,
  projects,
  categories = [],
}: {
  items: Task[];
  users: Opt[];
  teams: Opt[];
  projects: Opt[];
  categories?: Opt[];
}) {
  const toast = useToast();
  const [tasks, setTasks] = useState(items);
  useEffect(() => setTasks(items), [items]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);

  const [fSearch, setFSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fProject, setFProject] = useState("");
  const [fClient, setFClient] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fCategory, setFCategory] = useState("");

  const hasFilters = !!(fSearch || fStatus || fType || fPriority || fAssignee || fTeam || fProject || fClient || fDeadline || fCategory);

  function resetAll() {
    setFSearch(""); setFStatus(""); setFType(""); setFPriority("");
    setFAssignee(""); setFTeam(""); setFProject(""); setFClient(""); setFDeadline(""); setFCategory("");
  }

  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.clientId && t.clientName && !seen.has(t.clientId)) seen.set(t.clientId, t.clientName);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ro"));
  }, [tasks]);

  const filtered = useMemo(() => {
    const term = fSearch.trim().toLowerCase();
    return tasks.filter((t) => {
      if (fStatus && t.status !== fStatus) return false;
      if (fType && t.type !== fType) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fAssignee && t.assigneeId !== fAssignee) return false;
      if (fTeam && t.teamId !== fTeam) return false;
      if (fProject && t.projectId !== fProject) return false;
      if (fClient && t.clientId !== fClient) return false;
      if (fCategory && t.categoryId !== fCategory) return false;
      if (!matchesDue(t.dueAt, fDeadline)) return false;
      if (term && !t.title.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tasks, fSearch, fStatus, fType, fPriority, fAssignee, fTeam, fProject, fClient, fDeadline, fCategory]);

  const byStatus = useMemo(() => {
    const m = new Map<Status, Task[]>();
    for (const c of COLUMNS) m.set(c.status, []);
    for (const t of filtered) m.get(t.status)?.push(t);
    return m;
  }, [filtered]);

  function move(id: string, status: Status) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    const prev = tasks;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, status } : t)));
    setTaskStatus(id, status).then((res) => {
      if (res?.error) { setTasks(prev); toast.error(res.error); }
      else toast.success(`Mutat în „${LABEL[status]}"`);
    });
  }

  return (
    <>
      {/* Quick filters */}
      <div className="mb-2 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.key}
            onClick={() => setFDeadline((v) => (v === q.key ? "" : q.key))}
            className={`tap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              fDeadline === q.key ? "bg-brand text-white" : "card text-ink-soft"
            }`}
          >
            {q.label}
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={resetAll}
            className="tap ml-auto rounded-full border border-[var(--color-line)] px-4 py-1.5 text-sm text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            Resetează filtrele
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          placeholder="Caută…"
          className="h-9 min-w-36 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={fld}>
          <option value="">Status: toate</option>
          {COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>{c.label}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={fld}>
          <option value="">Tip: toate</option>
          <option value="TASK">Task</option>
          <option value="TICKET">Tichet</option>
          <option value="WORK_ORDER">Comandă</option>
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={fld}>
          <option value="">Prioritate: orice</option>
          <option value="URGENT">Urgentă</option>
          <option value="HIGH">Ridicată</option>
          <option value="MEDIUM">Medie</option>
          <option value="LOW">Scăzută</option>
        </select>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className={fld}>
          <option value="">Persoană: toți</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={fTeam} onChange={(e) => setFTeam(e.target.value)} className={fld}>
          <option value="">Echipă: toate</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={fld}>
          <option value="">Proiect: toate</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {clients.length > 0 && (
          <select value={fClient} onChange={(e) => setFClient(e.target.value)} className={fld}>
            <option value="">Client: toți</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {categories.length > 0 && (
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={fld}>
            <option value="">Categorie: toate</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className={fld}>
          {DEADLINE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colItems = byStatus.get(col.status) ?? [];
          const isOver = overCol === col.status;
          return (
            <div
              key={col.status}
              className="flex w-64 shrink-0 flex-col"
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.status) setOverCol(col.status);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id) move(id, col.status);
                setOverCol(null);
                setDragId(null);
              }}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className={`size-2.5 rounded-full ${col.dot}`} />
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="ml-auto rounded-full bg-[var(--color-surface-2)] px-2 text-xs text-ink-soft">
                  {colItems.length}
                </span>
              </div>
              <div
                className={`flex min-h-24 flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors ${
                  isOver ? "bg-brand-soft ring-2 ring-brand" : "bg-[var(--color-surface-2)]/60"
                }`}
              >
                {colItems.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(t.id);
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={`card block cursor-grab p-2.5 active:cursor-grabbing hover:opacity-90 ${dragId === t.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                      <span className="shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {TYPE_RO[t.type]}
                      </span>
                    </div>
                    {t.seq != null && (
                      <span className="mt-1 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-brand">
                        #{t.seq}
                      </span>
                    )}
                    <p className="mt-1 truncate text-[11px] text-ink-soft">
                      <span className={PRIO_CLR[t.priority]}>{PRIO_RO[t.priority]}</span>
                      {t.projectName && ` · ${t.projectName}`}
                      {(t.assigneeName || t.teamName) && ` · ${t.assigneeName ?? t.teamName}`}
                      {t.progress > 0 && ` · ${t.progress}%`}
                    </p>
                  </Link>
                ))}
                {colItems.length === 0 && <p className="py-3 text-center text-xs text-ink-soft">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

