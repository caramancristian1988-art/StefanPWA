import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { listPayers } from "@/lib/queries/payers";
import { money } from "@/app/components/invoice-meta";
import { INVOICE_STATUS, type InvoiceStatusKey } from "@/app/components/invoice-meta";
import { IconChevronLeft, IconChevronRight } from "@/app/components/icons";

export const dynamic = "force-dynamic";

export default async function PayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePermission("clients.view");
  const { q = "", status = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const statusFilter = status === "activated" || status === "pending" ? status : undefined;

  const { items, total, hasMore } = await listPayers({ search: q, status: statusFilter, page });

  const qp = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ q, status, ...overrides });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `?${p.toString()}`;
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Plătitori</h1>
        <p className="mt-1 text-sm text-ink-soft">{total} plătitori Apă-Canal — facturi, tichete, cont portal.</p>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" method="GET">
        <input
          name="q"
          defaultValue={q}
          placeholder="Caută nume, serie, email…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand"
        >
          <option value="">Toți</option>
          <option value="activated">Activați</option>
          <option value="pending">Neactivați</option>
        </select>
        <button type="submit" className="tap h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
          Filtrează
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {items.map((p) => {
          const st = p.latestInvoice ? INVOICE_STATUS[p.latestInvoice.status as InvoiceStatusKey] : null;
          return (
            <Link
              key={p.id}
              href={`/platitori/${p.id}`}
              className="card tap flex items-center justify-between gap-3 p-4 hover:border-brand"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-ink-soft">
                  Serie {p.meterSeries} · {p.email || "fără email"} ·{" "}
                  {p.activated ? (
                    <span className="text-brand-strong">activat</span>
                  ) : (
                    <span>neactivat</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="text-xs text-ink-soft">{p.invoiceCount} facturi</span>
                {st && p.latestInvoice && (
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{money(p.latestInvoice.grandTotal, p.latestInvoice.currency)}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                )}
                <IconChevronRight className="size-4 text-ink-soft" />
              </div>
            </Link>
          );
        })}
        {items.length === 0 && (
          <div className="card p-8 text-center text-sm text-ink-soft">Niciun plătitor găsit.</div>
        )}
      </div>

      {(page > 1 || hasMore) && (
        <div className="mt-5 flex items-center justify-between">
          <PageLink disabled={page <= 1} href={qp({ page: String(page - 1) })}>
            <IconChevronLeft className="size-4" /> Anterior
          </PageLink>
          <span className="text-sm text-ink-soft">Pagina {page}</span>
          <PageLink disabled={!hasMore} href={qp({ page: String(page + 1) })}>
            Următor <IconChevronRight className="size-4" />
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-ink-soft opacity-40">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="tap card inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium">
      {children}
    </Link>
  );
}
