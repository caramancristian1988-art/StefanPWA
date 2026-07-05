import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { getProject } from "@/lib/queries/projects";
import { listTasks } from "@/lib/queries/tasks";
import { userOptions } from "@/lib/queries/users";
import { teamOptions } from "@/lib/queries/teams";
import { invoiceClientOptions } from "@/lib/queries/invoices";
import ProjectMap from "@/app/components/ProjectMapDynamic";

export const dynamic = "force-dynamic";

const STATUS_RO: Record<string, string> = {
  ACTIVE: "Activ", ON_HOLD: "În așteptare", DONE: "Finalizat", ARCHIVED: "Arhivat",
};

const TASK_STATUS_RO: Record<string, string> = {
  NEW: "Nou", ASSIGNED: "Asignat", READ: "Citit",
  IN_PROGRESS: "În lucru", ON_HOLD: "În așteptare",
  REVIEW: "Verificare", DONE: "Finalizat", CANCELLED: "Anulat",
};

const TASK_STATUS_DOT: Record<string, string> = {
  NEW: "bg-st-new", ASSIGNED: "bg-st-new", READ: "bg-st-confirmed",
  IN_PROGRESS: "bg-st-progress", ON_HOLD: "bg-st-noshow",
  REVIEW: "bg-st-confirmed", DONE: "bg-st-done", CANCELLED: "bg-st-cancelled",
};

const PRIO_RO: Record<string, { label: string; cls: string }> = {
  URGENT: { label: "Urgent",   cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  HIGH:   { label: "Ridicată", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
  MEDIUM: { label: "Medie",    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  LOW:    { label: "Scăzută",  cls: "bg-[var(--color-surface-2)] text-ink-soft" },
};

function fmtDue(d: Date) {
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projects.view");
  const { id } = await params;

  const [project, users, teams, clients, tasksResult] = await Promise.all([
    getProject(id),
    userOptions(),
    teamOptions(),
    invoiceClientOptions(),
    listTasks({
      scope: "all",
      userId: user.id,
      teamIds: user.teamIds,
      projectId: id,
      pageSize: 200,
      page: 1,
    }),
  ]);

  if (!project) notFound();

  const assignee = users.find((u) => u.id === project.assigneeId);
  const team = teams.find((t) => t.id === project.teamId);
  const client = clients.find((c) => c.id === project.clientId);
  const hasLocation = project.lat != null && project.lng != null;

  const tasks = tasksResult.items;
  const activeTasks = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const doneTasks = tasks.filter((t) => t.status === "DONE" || t.status === "CANCELLED");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        ← Proiecte
      </Link>

      {/* ── Info proiect ── */}
      <div className="card mb-4 p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {project.seq != null && (
              <span className="mb-1 inline-block rounded bg-brand/10 px-2 py-0.5 font-mono text-xs font-bold text-brand">
                #{project.seq}
              </span>
            )}
            <h1 className="break-words text-xl font-bold">{project.name}</h1>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-ink-soft">
            {STATUS_RO[project.status as keyof typeof STATUS_RO] ?? project.status}
          </span>
        </div>

        {project.description && (
          <p className="mb-3 text-sm text-ink-soft">{project.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          {client && <span>Client: <span className="font-medium text-ink">{client.name}</span></span>}
          {assignee && <span>Responsabil: <span className="font-medium text-ink">{assignee.name}</span></span>}
          {team && <span>Echipă: <span className="font-medium text-ink">{team.name}</span></span>}
        </div>
      </div>

      {/* ── Hartă ── */}
      {hasLocation && (
        <div className="card mb-4 p-5">
          <h2 className="mb-3 text-sm font-semibold">Locație</h2>
          {project.address && (
            <p className="mb-2 text-sm text-ink-soft">{project.address}</p>
          )}
          <ProjectMap lat={project.lat!} lng={project.lng!} address={project.address} />
        </div>
      )}

      {/* ── Task-uri ── */}
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            Task-uri
            {tasks.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold text-ink-soft">
                {tasks.length}
              </span>
            )}
          </h2>
          <Link
            href={`/tasks?create=task&project=${id}`}
            className="tap inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong"
          >
            + Task nou
          </Link>
        </div>

        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            Niciun task în acest proiect.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {activeTasks.map((t) => {
              const dot = TASK_STATUS_DOT[t.status] ?? "bg-brand";
              const prio = PRIO_RO[t.priority];
              const due = t.dueAt ? new Date(t.dueAt) : null;
              const overdue = due && due < new Date();
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="tap flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-[var(--color-surface-2)]"
                >
                  <span className={`size-2 shrink-0 rounded-full ${dot}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  {prio && t.priority !== "LOW" && (
                    <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${prio.cls}`}>
                      {prio.label}
                    </span>
                  )}
                  {t.assigneeName && (
                    <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">{t.assigneeName}</span>
                  )}
                  {due && (
                    <span className={`shrink-0 text-[11px] font-mono ${overdue ? "text-st-cancelled font-semibold" : "text-ink-soft"}`}>
                      {fmtDue(due)}
                    </span>
                  )}
                  <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">
                    {TASK_STATUS_RO[t.status]}
                  </span>
                </Link>
              );
            })}

            {doneTasks.length > 0 && (
              <>
                <p className="mt-2 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                  Finalizate / Anulate ({doneTasks.length})
                </p>
                {doneTasks.map((t) => {
                  const dot = TASK_STATUS_DOT[t.status] ?? "bg-brand";
                  return (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="tap flex items-center gap-2.5 rounded-xl px-2.5 py-2 opacity-50 hover:bg-[var(--color-surface-2)] hover:opacity-100"
                    >
                      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
                      <span className="min-w-0 flex-1 truncate text-sm line-through">{t.title}</span>
                      <span className="shrink-0 text-[11px] text-ink-soft">{TASK_STATUS_RO[t.status]}</span>
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
