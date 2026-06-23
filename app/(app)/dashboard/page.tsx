import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { dashboardStats, listTasks } from "@/lib/queries/tasks";

export const dynamic = "force-dynamic";

const STATUS_RO: Record<string, { label: string; dot: string }> = {
  NEW: { label: "Nou", dot: "bg-st-new" },
  ASSIGNED: { label: "Asignat", dot: "bg-st-new" },
  READ: { label: "Citit", dot: "bg-st-confirmed" },
  IN_PROGRESS: { label: "În lucru", dot: "bg-st-progress" },
  ON_HOLD: { label: "În așteptare", dot: "bg-st-noshow" },
  REVIEW: { label: "În verificare", dot: "bg-st-confirmed" },
  DONE: { label: "Finalizat", dot: "bg-st-done" },
  CANCELLED: { label: "Anulat", dot: "bg-st-cancelled" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, mine] = await Promise.all([
    dashboardStats(user.id, user.teamIds),
    listTasks({ scope: "mine", userId: user.id, teamIds: user.teamIds, page: 1, pageSize: 8 }),
  ]);

  const cards = [
    { label: "Task-uri deschise", value: stats.tasksOpen, accent: "text-ink", href: "/tasks?scope=all" },
    { label: "Tichete deschise", value: stats.ticketsOpen, accent: "text-st-confirmed", href: "/tasks?scope=all" },
    { label: "Active (ale mele)", value: stats.myOpen, accent: "text-ink", href: "/tasks?scope=mine" },
    { label: "În lucru (ale mele)", value: stats.myInProgress, accent: "text-st-progress", href: "/tasks?scope=mine" },
    { label: "În verificare", value: stats.myReview, accent: "text-st-confirmed", href: "/tasks?scope=mine" },
    { label: "Proiecte active", value: stats.projectsActive, accent: "text-brand", href: "/projects" },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card tap p-3.5 hover:border-brand">
            <p className={`text-2xl font-bold ${c.accent}`}>{c.value}</p>
            <p className="mt-0.5 text-xs leading-tight text-ink-soft">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Task-urile mele</h2>
          <Link href="/tasks" className="text-xs font-medium text-brand hover:underline">Vezi toate</Link>
        </div>
        {mine.items.length === 0 ? (
          <div className="card grid place-items-center p-8 text-center text-sm text-ink-soft">
            Niciun task activ. Apasă „+" pentru a crea unul.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mine.items.map((t) => {
              const meta = STATUS_RO[t.status] ?? STATUS_RO.NEW;
              return (
                <Link key={t.id} href="/tasks" className="card tap flex items-center gap-2.5 px-3 py-2 hover:border-brand">
                  <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <span className="shrink-0 text-[11px] text-ink-soft">{meta.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
