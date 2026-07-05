import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { dashboardStats, listTasks } from "@/lib/queries/tasks";
import DashboardFilters from "@/app/components/DashboardFilters";
import type { TaskPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_RO: Record<string, { label: string; dot: string }> = {
  NEW:         { label: "Nou",           dot: "bg-st-new" },
  ASSIGNED:    { label: "Asignat",       dot: "bg-st-new" },
  READ:        { label: "Citit",         dot: "bg-st-confirmed" },
  IN_PROGRESS: { label: "În lucru",      dot: "bg-st-progress" },
  ON_HOLD:     { label: "În așteptare",  dot: "bg-st-noshow" },
  REVIEW:      { label: "În verificare", dot: "bg-st-confirmed" },
  DONE:        { label: "Finalizat",     dot: "bg-st-done" },
  CANCELLED:   { label: "Anulat",        dot: "bg-st-cancelled" },
};

const PRIO_RO: Record<string, { label: string; cls: string }> = {
  URGENT: { label: "Urgent",   cls: "bg-red-100 text-red-700" },
  HIGH:   { label: "Ridicată", cls: "bg-orange-100 text-orange-700" },
  MEDIUM: { label: "Medie",    cls: "bg-yellow-100 text-yellow-700" },
  LOW:    { label: "Scăzută",  cls: "bg-[var(--color-surface-2)] text-ink-soft" },
};

function buildPageButtons(page: number, total: number) {
  if (total <= 1) return [];
  const buttons: (number | "…")[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - page) <= 2) buttons.push(i);
    else if (buttons[buttons.length - 1] !== "…") buttons.push("…");
  }
  return buttons;
}

async function StatsSection({
  userId,
  teamIds,
  role,
}: {
  userId: string;
  teamIds: string[];
  role: "ADMIN" | "STAFF";
}) {
  const stats = await dashboardStats(userId, teamIds, role);
  const isAdmin = role === "ADMIN";
  const cards = [
    {
      label: isAdmin ? "Task-uri deschise" : "Task-urile mele deschise",
      value: stats.tasksOpen,
      accent: "text-ink",
      href: isAdmin ? "/tasks?scope=all" : "/tasks?scope=mine",
    },
    {
      label: isAdmin ? "Tichete deschise" : "Tichetele mele deschise",
      value: stats.ticketsOpen,
      accent: "text-st-confirmed",
      href: isAdmin ? "/tickets?scope=all" : "/tickets?scope=mine",
    },
    { label: "Active (ale mele)",    value: stats.myOpen,        accent: "text-ink",           href: "/tasks?scope=mine" },
    { label: "În lucru (ale mele)",  value: stats.myInProgress,  accent: "text-st-progress",   href: "/tasks?scope=mine&status=IN_PROGRESS" },
    { label: "În verificare",        value: stats.myReview,      accent: "text-st-confirmed",  href: "/tasks?scope=mine&status=REVIEW" },
    { label: "Proiecte active",      value: stats.projectsActive, accent: "text-brand",        href: "/projects" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <Link key={c.label} href={c.href} className="card tap p-3.5 hover:border-brand">
          <p className={`text-2xl font-bold ${c.accent}`}>{c.value}</p>
          <p className="mt-0.5 text-xs leading-tight text-ink-soft">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card p-3.5">
          <div className="h-7 w-10 animate-pulse rounded bg-[var(--color-surface-2)]" />
          <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-[var(--color-surface-2)]" />
        </div>
      ))}
    </div>
  );
}

async function TasksSection({
  userId,
  teamIds,
  prio,
  sort,
  page,
  pageSize,
  ps,
  scope,
}: {
  userId: string;
  teamIds: string[];
  prio: string;
  sort: string;
  page: number;
  pageSize: number;
  ps: string;
  scope: string;
}) {
  const effectiveScope = (scope === "all" ? "all" : "mine") as "all" | "mine";
  const result = await listTasks({
    scope: effectiveScope,
    userId,
    teamIds,
    priority: (prio as TaskPriority) || undefined,
    sort: (sort === "dueAsc" || sort === "dueDesc" ? sort : undefined),
    page,
    pageSize,
  });

  const { items, totalPages } = result;
  const pageButtons = buildPageButtons(page, totalPages);

  return (
    <>
      {items.length === 0 ? (
        <div className="card grid place-items-center p-8 text-center text-sm text-ink-soft">
          Niciun task activ. Apasă „+" pentru a crea unul.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((t) => {
            const meta = STATUS_RO[t.status] ?? STATUS_RO.NEW;
            const pMeta = PRIO_RO[t.priority];
            const due = t.dueAt ? new Date(t.dueAt) : null;
            const overdue = due && due < new Date() && t.status !== "DONE" && t.status !== "CANCELLED";
            return (
              <Link key={t.id} href={`/tasks?open=${t.id}`} className="card tap flex items-center gap-2.5 px-3 py-2.5 hover:border-brand">
                <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                {pMeta && (
                  <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${pMeta.cls}`}>
                    {pMeta.label}
                  </span>
                )}
                {due && (
                  <span className={`shrink-0 text-[11px] font-mono ${overdue ? "text-st-cancelled font-semibold" : "text-ink-soft"}`}>
                    {due.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}
                  </span>
                )}
                <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">{meta.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {pageButtons.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
          {pageButtons.map((b, i) => {
            const params = new URLSearchParams();
            if (scope && scope !== "mine") params.set("scope", scope);
            if (prio) params.set("prio", prio);
            if (sort) params.set("sort", sort);
            if (ps && ps !== "20") params.set("ps", ps);
            if (Number(b) > 1) params.set("page", String(b));
            const href = `/dashboard${params.toString() ? `?${params.toString()}` : ""}`;
            return b === "…" ? (
              <span key={`e${i}`} className="px-1 text-xs text-ink-soft">…</span>
            ) : (
              <Link
                key={b}
                href={href}
                className={`tap grid size-8 place-items-center rounded-lg text-sm ${
                  b === page
                    ? "bg-brand font-semibold text-white"
                    : "border border-[var(--color-line)] text-ink hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {b}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card flex items-center gap-2.5 px-3 py-2">
          <div className="size-2.5 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-[var(--color-surface-2)]" style={{ width: `${40 + (i * 13) % 40}%` }} />
          <div className="h-3 w-14 animate-pulse rounded bg-[var(--color-surface-2)]" />
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const prio = sp.prio ?? "";
  const sort = sp.sort ?? "";
  const ps = sp.ps ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = ps === "all" ? 9999 : Math.min(9999, Math.max(1, Number(ps) || 10));
  const isAdmin = user.role === "ADMIN";
  const scope = isAdmin && sp.scope === "all" ? "all" : "mine";

  const heading = scope === "all" ? "Toate task-urile" : "Task-urile mele";
  const tasksHref = scope === "all" ? "/tasks?scope=all" : "/tasks?scope=mine";

  return (
    <div className="w-full">
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection userId={user.id} teamIds={user.teamIds} role={user.role} />
      </Suspense>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{heading}</h2>
          <Link href={tasksHref} className="text-xs font-medium text-brand hover:underline">
            Vezi toate
          </Link>
        </div>

        <DashboardFilters prio={prio} sort={sort} ps={ps} scope={scope} isAdmin={isAdmin} />

        <Suspense fallback={<TasksSkeleton />}>
          <TasksSection userId={user.id} teamIds={user.teamIds} prio={prio} sort={sort} page={page} pageSize={pageSize} ps={ps} scope={scope} />
        </Suspense>
      </div>
    </div>
  );
}
