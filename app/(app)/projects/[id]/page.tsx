import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { getProject } from "@/lib/queries/projects";
import { userOptions } from "@/lib/queries/users";
import { teamOptions } from "@/lib/queries/teams";
import { invoiceClientOptions } from "@/lib/queries/invoices";
import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

const ProjectMap = nextDynamic(() => import("@/app/components/ProjectMap"), { ssr: false });

const STATUS_RO = { ACTIVE: "Activ", ON_HOLD: "În așteptare", DONE: "Finalizat", ARCHIVED: "Arhivat" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("projects.view");
  const { id } = await params;
  const [project, users, teams, clients] = await Promise.all([
    getProject(id),
    userOptions(),
    teamOptions(),
    invoiceClientOptions(),
  ]);
  if (!project) notFound();

  const assignee = users.find((u) => u.id === project.assigneeId);
  const team = teams.find((t) => t.id === project.teamId);
  const client = clients.find((c) => c.id === project.clientId);
  const hasLocation = project.lat != null && project.lng != null;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        ← Proiecte
      </Link>

      <div className="card mb-4 p-5">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{project.name}</h1>
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

      <div className="card mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold">Locație</h2>
        {hasLocation ? (
          <>
            {project.address && (
              <p className="mb-3 text-sm text-ink-soft">{project.address}</p>
            )}
            <p className="mb-3 font-mono text-xs text-ink-soft">
              {project.lat?.toFixed(6)}, {project.lng?.toFixed(6)}
            </p>
            <ProjectMap lat={project.lat!} lng={project.lng!} address={project.address} />
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            Nicio locație salvată. Editează proiectul pentru a adăuga coordonate.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Link
          href={`/tasks?scope=all&proj=${id}&project=${id}`}
          className="tap flex h-11 flex-1 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Vezi task-urile proiectului
        </Link>
        <Link
          href={`/tasks?create=task&project=${id}`}
          className="tap flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] px-4 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          + Task nou
        </Link>
      </div>
    </div>
  );
}
