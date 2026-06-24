import { requirePermission } from "@/lib/dal";
import { listTasks } from "@/lib/queries/tasks";
import { userOptions } from "@/lib/queries/users";
import { teamOptions } from "@/lib/queries/teams";
import { projectOptions } from "@/lib/queries/projects";
import TaskKanban from "@/app/components/TaskKanban";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const user = await requirePermission("tasks.view");

  const KANBAN_LIMIT = 100;
  const [result, users, teams, projects] = await Promise.all([
    listTasks({ scope: "all", userId: user.id, teamIds: user.teamIds, page: 1, pageSize: KANBAN_LIMIT }),
    userOptions(),
    teamOptions(),
    projectOptions(),
  ]);

  return (
    <div className="w-full">
      {result.hasMore && (
        <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-100/60 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
          Kanban afișează primele {KANBAN_LIMIT} task-uri. Folosește <strong>lista</strong> pentru filtrare avansată cu mai multe date.
        </div>
      )}
      <TaskKanban items={result.items} users={users} teams={teams} projects={projects} />
    </div>
  );
}
