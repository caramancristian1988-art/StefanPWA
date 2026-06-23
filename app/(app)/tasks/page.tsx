import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { listTasks } from "@/lib/queries/tasks";
import { userOptions } from "@/lib/queries/users";
import { teamOptions } from "@/lib/queries/teams";
import { projectOptions } from "@/lib/queries/projects";
import { invoiceClientOptions } from "@/lib/queries/invoices";
import TasksManager from "@/app/components/TasksManager";
import type { TaskStatus, TaskType, TaskPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const SCOPES = [
  { key: "mine", label: "Ale mele" },
  { key: "all", label: "Toate" },
  { key: "created", label: "Create de mine" },
] as const;

const STATUS_SET = new Set(["NEW", "ASSIGNED", "READ", "IN_PROGRESS", "ON_HOLD", "REVIEW", "DONE", "CANCELLED"]);
const TYPE_SET = new Set(["TASK", "TICKET", "WORK_ORDER"]);
const PRIO_SET = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

function pick<T extends string>(v: string | undefined, set: Set<string>): T | undefined {
  return v && set.has(v) ? (v as T) : undefined;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string; page?: string; create?: string; project?: string;
    q?: string; status?: string; type?: string; assignee?: string;
    proj?: string; client?: string; prio?: string; due?: string;
    open?: string;
  }>;
}) {
  const user = await requirePermission("tasks.view");
  const sp = await searchParams;
  const scope = (["mine", "all", "created"].includes(sp.scope ?? "")
    ? sp.scope
    : "mine") as "mine" | "all" | "created";
  const page = Math.max(1, Number(sp.page) || 1);
  const initialCreate =
    sp.create === "ticket" ? "TICKET" : sp.create === "work_order" ? "WORK_ORDER" : sp.create === "task" ? "TASK" : undefined;
  const initialProjectId = typeof sp.project === "string" ? sp.project : undefined;
  const initialOpenId = typeof sp.open === "string" && sp.open ? sp.open : undefined;

  const dueBefore = /^\d{4}-\d{2}-\d{2}$/.test(sp.due ?? "") ? new Date(`${sp.due}T23:59:59.999`) : undefined;

  // Filtrare 100% pe server: aducem doar ce se potrivește, paginat.
  const [result, users, teams, projects, clients] = await Promise.all([
    listTasks({
      scope,
      userId: user.id,
      teamIds: user.teamIds,
      status: pick<TaskStatus>(sp.status, STATUS_SET),
      type: pick<TaskType>(sp.type, TYPE_SET),
      priority: pick<TaskPriority>(sp.prio, PRIO_SET),
      assigneeId: sp.assignee || undefined,
      projectId: sp.proj || undefined,
      clientId: sp.client || undefined,
      dueBefore,
      search: sp.q || undefined,
      page,
      pageSize: 30,
    }),
    userOptions(),
    teamOptions(),
    projectOptions(),
    invoiceClientOptions(),
  ]);

  return (
    <div className="w-full">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {SCOPES.map((s) => (
          <Link
            key={s.key}
            href={`/tasks?scope=${s.key}`}
            prefetch={false}
            className={`tap shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
              scope === s.key ? "bg-brand text-white" : "card text-ink-soft"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <TasksManager
        items={result.items}
        hasMore={result.hasMore}
        page={result.page}
        scope={scope}
        users={users}
        teams={teams}
        projects={projects}
        clients={clients}
        filters={{
          q: sp.q ?? "",
          status: sp.status ?? "",
          type: sp.type ?? "",
          assignee: sp.assignee ?? "",
          proj: sp.proj ?? "",
          client: sp.client ?? "",
          prio: sp.prio ?? "",
          due: sp.due ?? "",
        }}
        canCreate={can(user, "tasks.create")}
        canDelete={can(user, "tasks.delete")}
        canEdit={can(user, "tasks.edit")}
        canCreateProject={can(user, "projects.create")}
        initialCreate={can(user, "tasks.create") ? initialCreate : undefined}
        initialProjectId={can(user, "tasks.create") ? initialProjectId : undefined}
        initialOpenId={initialOpenId}
      />
    </div>
  );
}
