import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { getTask } from "@/lib/queries/tasks";
import { listTaskComments } from "@/lib/services/tasks";
import type { TaskStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ST: Record<string, { label: string; dot: string; badge: string }> = {
  NEW:         { label: "Nou",            dot: "bg-st-new",       badge: "bg-st-new/15 text-st-new" },
  ASSIGNED:    { label: "Asignat",        dot: "bg-st-new",       badge: "bg-st-new/15 text-st-new" },
  READ:        { label: "Citit",          dot: "bg-st-confirmed", badge: "bg-st-confirmed/15 text-st-confirmed" },
  IN_PROGRESS: { label: "În lucru",       dot: "bg-st-progress",  badge: "bg-st-progress/15 text-st-progress" },
  ON_HOLD:     { label: "În așteptare",   dot: "bg-st-noshow",    badge: "bg-st-noshow/15 text-st-noshow" },
  REVIEW:      { label: "În verificare",  dot: "bg-st-confirmed", badge: "bg-st-confirmed/15 text-st-confirmed" },
  DONE:        { label: "Finalizat",      dot: "bg-st-done",      badge: "bg-st-done/15 text-st-done" },
  CANCELLED:   { label: "Anulat",         dot: "bg-st-cancelled", badge: "bg-st-cancelled/15 text-st-cancelled" },
};
const PRIO_RO: Record<string, string> = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const TYPE_RO: Record<string, string>  = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Work order" };
const SOURCE_RO: Record<string, string> = { WEB: "", TELEGRAM: "via Telegram", VOICE: "din voce" };

function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("ro-RO");
}
function fmtDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}min`;
  const days = Math.floor(hours / 24);
  const rh = hours % 24;
  return rh > 0 ? `${days}z ${rh}h` : `${days}z`;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("tasks.view");
  const { id } = await params;

  const [task, comments] = await Promise.all([
    getTask(id),
    listTaskComments(id),
  ]);

  if (!task) notFound();

  // Activities in chronological order (getTask returns DESC, we reverse for timeline)
  const activities = [...(task.activities ?? [])].reverse();

  const isOverdue =
    task.dueAt &&
    new Date(task.dueAt) < new Date() &&
    task.status !== "DONE" &&
    task.status !== "CANCELLED";

  const overdueMs = isOverdue ? Date.now() - new Date(task.dueAt!).getTime() : 0;

  // Build unified timeline: creation + status changes
  type TimelineEvent = {
    key: string;
    at: Date;
    dot: string;
    label: string;
    by: string;
    note?: string | null;
  };

  const timeline: TimelineEvent[] = [
    {
      key: "created",
      at: task.createdAt,
      dot: "bg-st-new",
      label: "Creat",
      by: task.creator.name,
    },
    ...activities.map((a) => ({
      key: a.id,
      at: a.createdAt,
      dot: ST[a.toStatus]?.dot ?? "bg-brand",
      label: a.fromStatus
        ? `${ST[a.fromStatus as TaskStatus]?.label ?? a.fromStatus} → ${ST[a.toStatus as TaskStatus]?.label ?? a.toStatus}`
        : ST[a.toStatus as TaskStatus]?.label ?? a.toStatus,
      by: a.user?.name ?? "—",
      note: a.note,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Back link */}
      <Link
        href="/tasks"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        ← Înapoi la task-uri
      </Link>

      {/* ── Header ────────────────────────────────────────── */}
      <div className="card mb-3 p-4">
        {/* Badges */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {task.seq != null && (
            <span className="rounded bg-brand/10 px-2 py-0.5 font-mono text-sm font-bold text-brand">
              #{task.seq}
            </span>
          )}
          <span className="rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-ink-soft">
            {TYPE_RO[task.type] ?? task.type}
          </span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ST[task.status]?.badge ?? ""}`}>
            {ST[task.status]?.label ?? task.status}
          </span>
          {isOverdue && (
            <span className="rounded bg-st-cancelled/15 px-2 py-0.5 text-[11px] font-semibold text-st-cancelled">
              ⏰ Întârziere {fmtDuration(overdueMs)}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="mb-3 text-xl font-bold leading-tight">{task.title}</h1>

        {/* Description */}
        {task.description && (
          <p className="mb-3 whitespace-pre-wrap rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5 text-sm">
            {task.description}
          </p>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <MetaRow label="Prioritate" value={PRIO_RO[task.priority] ?? task.priority} />
          {task.assignee?.name && <MetaRow label="Asignat" value={task.assignee.name} />}
          {task.team?.name && <MetaRow label="Echipă" value={task.team.name} />}
          {task.project?.name && <MetaRow label="Proiect" value={task.project.name} />}
          {task.project?.client?.name && <MetaRow label="Client" value={task.project.client.name} />}
          {task.progress > 0 && <MetaRow label="Progres" value={`${task.progress}%`} />}
          {task.dueAt && (
            <MetaRow
              label="Scadent"
              value={fmtDate(task.dueAt)}
              alert={!!isOverdue}
            />
          )}
          <MetaRow label="Creat" value={fmtDateTime(task.createdAt)} />
          <MetaRow label="Creat de" value={task.creator.name} />
        </div>
      </div>

      {/* ── Timeline ──────────────────────────────────────── */}
      <div className="card mb-3 p-4">
        <h2 className="mb-4 text-sm font-bold">📋 Istoric</h2>
        <ol className="flex flex-col">
          {timeline.map((ev, i) => {
            const prev = timeline[i - 1];
            const durationMs = prev ? new Date(ev.at).getTime() - new Date(prev.at).getTime() : 0;
            const isLast = i === timeline.length - 1;
            return (
              <li key={ev.key} className="flex gap-3">
                {/* Dot + line */}
                <div className="flex flex-col items-center pt-1">
                  <span className={`size-2.5 shrink-0 rounded-full ${ev.dot}`} />
                  {!isLast && <span className="my-1.5 w-0.5 flex-1 bg-[var(--color-line)]" />}
                </div>
                {/* Content */}
                <div className={`min-w-0 flex-1 ${!isLast ? "pb-4" : ""}`}>
                  <p className="text-sm font-semibold">{ev.label}</p>
                  <p className="text-[11px] text-ink-soft">
                    {ev.by} · {fmtDateTime(ev.at)}
                  </p>
                  {prev && (
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      ⏱ {fmtDuration(durationMs)} față de evenimentul anterior
                    </p>
                  )}
                  {ev.note && (
                    <p className="mt-1 text-[11px] italic text-ink-soft">{ev.note}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Total duration */}
        {timeline.length > 1 && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-3 text-[11px] text-ink-soft">
            Durată totală de la creare:{" "}
            <span className="font-semibold text-ink">
              {fmtDuration(
                new Date(timeline[timeline.length - 1].at).getTime() -
                  new Date(timeline[0].at).getTime(),
              )}
            </span>
          </div>
        )}
      </div>

      {/* ── Comments ──────────────────────────────────────── */}
      {comments.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-bold">💬 Comentarii ({comments.length})</h2>
          <div className="flex flex-col gap-4">
            {comments.map((c) => (
              <div key={c.id}>
                <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">{c.user?.name ?? "—"}</span>
                  <span className="text-[11px] text-ink-soft">{fmtDateTime(c.createdAt)}</span>
                  {c.source !== "WEB" && (
                    <span className="text-[10px] text-ink-soft">· {SOURCE_RO[c.source]}</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`text-sm font-medium ${alert ? "text-st-cancelled" : ""}`}>{value}</p>
    </div>
  );
}
