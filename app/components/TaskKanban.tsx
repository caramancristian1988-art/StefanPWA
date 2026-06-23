"use client";

import { useEffect, useMemo, useState } from "react";
import { setTaskStatus } from "@/app/actions/tasks";
import { useToast } from "./toast";

type Opt = { id: string; name: string };
type Status = "NEW" | "ASSIGNED" | "READ" | "IN_PROGRESS" | "ON_HOLD" | "REVIEW" | "DONE" | "CANCELLED";
type Task = {
  id: string;
  type: "TASK" | "TICKET" | "WORK_ORDER";
  title: string;
  status: Status;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  progress: number;
  assigneeId: string | null;
  assigneeName: string | null;
  teamName: string | null;
  projectName: string | null;
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
const LABEL: Record<Status, string> = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label])) as Record<Status, string>;
const TYPE_RO = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Work order" };
const PRIO = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const PRIO_CLR = { LOW: "text-ink-soft", MEDIUM: "text-ink-soft", HIGH: "text-st-noshow", URGENT: "text-st-cancelled" };
const fld =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-brand";

export default function TaskKanban({ items, users }: { items: Task[]; users: Opt[] }) {
  const toast = useToast();
  const [tasks, setTasks] = useState(items);
  useEffect(() => setTasks(items), [items]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);

  // Filtre client-side
  const [fSearch, setFSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fAssignee, setFAssignee] = useState("");

  const filtered = useMemo(() => {
    const term = fSearch.trim().toLowerCase();
    return tasks.filter((t) => {
      if (fType && t.type !== fType) return false;
      if (fAssignee && t.assigneeId !== fAssignee) return false;
      if (term && !t.title.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tasks, fSearch, fType, fAssignee]);

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
      if (res?.error) {
        setTasks(prev);
        toast.error(res.error);
      } else {
        toast.success(`Mutat în „${LABEL[status]}"`);
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          placeholder="Caută…"
          className="h-9 min-w-40 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
        />
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={fld}>
          <option value="">Tip: toate</option>
          <option value="TASK">Task</option>
          <option value="TICKET">Tichet</option>
          <option value="WORK_ORDER">Work order</option>
        </select>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className={fld}>
          <option value="">Persoană: toți</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(fSearch || fType || fAssignee) && (
          <button
            onClick={() => { setFSearch(""); setFType(""); setFAssignee(""); }}
            className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
          >
            Resetează
          </button>
        )}
      </div>

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
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(t.id);
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={`card cursor-grab p-2.5 active:cursor-grabbing ${dragId === t.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                      <span className="shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {TYPE_RO[t.type]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-soft">
                      <span className={PRIO_CLR[t.priority]}>{PRIO[t.priority]}</span>
                      {t.projectName && ` · ${t.projectName}`}
                      {(t.assigneeName || t.teamName) && ` · ${t.assigneeName ?? t.teamName}`}
                      {t.progress > 0 && ` · ${t.progress}%`}
                    </p>
                  </div>
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
