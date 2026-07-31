import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { getPayer, getPayerInvoices, getPayerTickets } from "@/lib/queries/payers";
import { money, fmtDate, INVOICE_STATUS, type InvoiceStatusKey } from "@/app/components/invoice-meta";
import { TASK_STATUS_RO } from "@/lib/telegram";
import PayerActions from "@/app/components/PayerActions";
import { IconChevronLeft } from "@/app/components/icons";

export const dynamic = "force-dynamic";

export default async function PayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clients.view");
  const { id } = await params;

  const payer = await getPayer(id);
  if (!payer) notFound();

  const [invoices, tickets] = await Promise.all([getPayerInvoices(id), getPayerTickets(id)]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/platitori" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <IconChevronLeft className="size-4" /> Înapoi la plătitori
      </Link>

      <div className="card p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{payer.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Serie contor: <b>{payer.meterSeries}</b>
              {payer.meterNumber && <> · Contor: {payer.meterNumber}</>}
            </p>
            {payer.consumAddress && <p className="text-sm text-ink-soft">{payer.consumAddress}</p>}
          </div>
          {payer.activated ? (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-strong">Cont activat</span>
          ) : (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-ink-soft">Cont neactivat</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-ink-soft">Email</p>
            <p className="font-medium">{payer.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Telefon</p>
            <p className="font-medium">{payer.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Activat la</p>
            <p className="font-medium">{payer.portalActivatedAt ? fmtDate(payer.portalActivatedAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Ultima logare</p>
            <p className="font-medium">{payer.portalLastLoginAt ? fmtDate(payer.portalLastLoginAt) : "—"}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/invoices/new?kind=apa-canal&clientId=${payer.id}`}
          className="tap h-10 rounded-xl bg-brand px-4 text-sm font-semibold leading-10 text-white hover:bg-brand-strong"
        >
          Trimite factură nouă
        </Link>
      </div>

      <PayerActions
        payer={{ id: payer.id, name: payer.name, phone: payer.phone, email: payer.email, notes: payer.notes }}
        canEdit={can(user, "clients.edit")}
        canDelete={can(user, "clients.delete")}
        canAdmin={can(user, "admin")}
      />

      <div>
        <h2 className="mb-2 text-base font-bold">Facturi ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-soft">Nicio factură încă.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => {
              const st = INVOICE_STATUS[inv.status as InvoiceStatusKey];
              return (
                <div key={inv.id} className="card flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold">{inv.number}</p>
                    <p className="text-xs text-ink-soft">Emisă: {fmtDate(inv.issueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{money(inv.grandTotal, inv.currency)}</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <Link href={`/invoice/public/${inv.publicToken}`} className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs font-medium leading-9 hover:bg-[var(--color-surface-2)]">
                      Vezi
                    </Link>
                    <Link href={`/invoices/${inv.id}/edit`} className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs font-medium leading-9 hover:bg-[var(--color-surface-2)]">
                      Editează
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-base font-bold">Tichete ({tickets.length})</h2>
        {tickets.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-soft">Niciun tichet încă.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="card tap flex items-center justify-between p-4 hover:border-brand">
                <div>
                  <p className="text-sm font-semibold">
                    {t.seq ? `#${t.seq} · ` : ""}
                    {t.title}
                  </p>
                  <p className="text-xs text-ink-soft">{fmtDate(t.createdAt)}</p>
                </div>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                  {TASK_STATUS_RO[t.status] ?? t.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
