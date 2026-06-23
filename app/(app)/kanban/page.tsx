import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { listTasks } from "@/lib/queries/tasks";
import { userOptions } from "@/lib/queries/users";
import TaskKanban from "@/app/components/TaskKanban";

export const dynamic = "force-dynamic";

const SCOPES = [
  { key: "mine", label: "Ale mele" },
  { key: "all", label: "Toate" },
  { key: "created", label: "Create de mine" },
] as const;

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requirePermission("tasks.view");
  const sp = await searchParams;
  const scope = (["mine", "all", "created"].includes(sp.scope ?? "")
    ? sp.scope
    : "mine") as "mine" | "all" | "created";

  const [result, users] = await Promise.all([
    listTasks({ scope, userId: user.id, teamIds: user.teamIds, page: 1, pageSize: 200 }),
    userOptions(),
  ]);

  return (
    <div className="w-full">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {SCOPES.map((s) => (
          <Link
            key={s.key}
            href={`/kanban?scope=${s.key}`}
            prefetch={false}
            className={`tap shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
              scope === s.key ? "bg-brand text-white" : "card text-ink-soft"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
      <TaskKanban items={result.items} users={users} />
    </div>
  );
}
