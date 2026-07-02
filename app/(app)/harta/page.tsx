import { requirePermission } from "@/lib/dal";
import { listProjectsWithLocation } from "@/lib/queries/projects";
import ProjectsMapViewDynamic from "@/app/components/ProjectsMapViewDynamic";

export const dynamic = "force-dynamic";

export default async function HartaPage() {
  await requirePermission("projects.view");
  const pins = await listProjectsWithLocation();

  return (
    <div className="w-full">
      <h1 className="mb-4 text-lg font-bold">Hartă proiecte</h1>
      <ProjectsMapViewDynamic pins={pins} />
    </div>
  );
}
