import { requirePermission } from "@/lib/dal";
import { listProjectsWithLocation } from "@/lib/queries/projects";
import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

const ProjectsMapView = nextDynamic(
  () => import("@/app/components/ProjectsMapView"),
  { ssr: false },
);

export default async function HartaPage() {
  await requirePermission("projects.view");
  const pins = await listProjectsWithLocation();

  return (
    <div className="w-full">
      <h1 className="mb-4 text-lg font-bold">Hartă proiecte</h1>
      <ProjectsMapView pins={pins} />
    </div>
  );
}
