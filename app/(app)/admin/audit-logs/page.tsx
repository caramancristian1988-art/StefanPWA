import { requireSuperAdmin } from "@/lib/dal";
import { listAuditLogs } from "@/lib/queries/audit";
import { userOptions } from "@/lib/queries/users";
import AuditLogsClient from "@/app/components/AuditLogsClient";

export const dynamic = "force-dynamic";

function toDate(s: string | undefined, end = false): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T${end ? "23:59:59.999" : "00:00:00.000"}`);
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    user?: string;
    role?: string;
    action?: string;
    module?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [result, users] = await Promise.all([
    listAuditLogs({
      userId: sp.user || undefined,
      role: sp.role || undefined,
      action: sp.action || undefined,
      module: sp.module || undefined,
      from: toDate(sp.from),
      to: toDate(sp.to, true),
      search: sp.q || undefined,
      page,
      pageSize: 30,
    }),
    userOptions(),
  ]);

  return (
    <div className="w-full">
      <div className="mb-3">
        <h1 className="text-lg font-bold">Audit Logs</h1>
        <p className="text-xs text-ink-soft">Istoric complet al acțiunilor — vizibil doar pentru super-admini.</p>
      </div>
      <AuditLogsClient
        items={result.items}
        users={users}
        page={result.page}
        hasMore={result.hasMore}
        filters={{
          user: sp.user ?? "",
          role: sp.role ?? "",
          action: sp.action ?? "",
          module: sp.module ?? "",
          from: sp.from ?? "",
          to: sp.to ?? "",
          q: sp.q ?? "",
        }}
      />
    </div>
  );
}
