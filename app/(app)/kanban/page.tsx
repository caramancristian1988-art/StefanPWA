import { requirePermission } from "@/lib/dal";
import { listTasks } from "@/lib/queries/tasks";
import { userOptions } from "@/lib/queries/users";
import { teamOptions } from "@/lib/queries/teams";
import { projectOptions } from "@/lib/queries/projects";
import TaskKanban from "@/app/components/TaskKanban";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const user = await requirePermission("tasks.view");

  const [result, users, teams, projects] = await Promise.all([
    listTasks({ scope: "all", userId: user.id, teamIds: user.teamIds, page: 1, pageSize: 300 }),
    userOptions(),
    teamOptions(),
    projectOptions(),
  ]);

  return (
    <div className="w-full">
      <TaskKanban items={result.items} users={users} teams={teams} projects={projects} />
    </div>
  );
}
