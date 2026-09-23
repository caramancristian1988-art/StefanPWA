import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { can } from "@/lib/permissions";
import ExportButton from "@/app/components/ExportButton";
import ImportButton from "@/app/components/ImportButton";
import { listPayers, countPayersNeedingNameFix, normalizePerPage, PER_PAGE_OPTIONS, type PayerSector, type PayerDebtFilter, type PayerSort } from "@/lib/queries/payers";
import { money } from "@/app/components/invoice-meta";
import { INVOICE_STATUS, INVOICE_STATUS_LIST, type InvoiceStatusKey } from "@/app/components/invoice-meta";
import { IconChevronLeft, IconChevronRight } from "@/app/components/icons";
import type { InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const SECTORS: { value: PayerSector; label: string }[] = [
  { value: "privat", label: "Sector privat" },
  { value: "comunal", label: "Sector comunal" },
];
const DEBT_OPTIONS: { value: PayerDebtFilter; label: string }[] = [
  { value: "has", label: "Cu datorie" },
  { value: "none", label: "Fără datorie" },
];
const SORT_OPTIONS: { value: PayerSort; label: string }[] = [
  { value: "name", label: "Nume (A-Z)" },
  { value: "debtDesc", label: "Sold: descrescător" },
  { value: "debtAsc", label: "Sold: crescător" },
];
const selectCls =
  "h-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default async function PayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; status?: string; sector?: string; invoiceStatus?: string;
    debt?: string; street?: string; sort?: string; page?: string; perPage?: string; nameFix?: string;
  }>;
}) {
  const user = await requirePermission("clients.view");
  const canImport = can(user, "clients.create") && can(user, "clients.edit");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const sector = sp.sector === "privat" || sp.sector === "comunal" ? sp.sector : "";
  const invoiceStatus = INVOICE_STATUS_LIST.includes(sp.invoiceStatus as InvoiceStatusKey) ? sp.invoiceStatus! : "";
  const debt = sp.debt === "has" || sp.debt === "none" ? sp.debt : "";
  const street = sp.street ?? "";
  const sort = sp.sort === "debtDesc" || sp.sort === "debtAsc" ? sp.sort : "name";
  const nameFix = sp.nameFix === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const perPage = normalizePerPage(sp.perPage);
  const statusFilter = status === "activated" || status === "pending" ? status : undefined;

  const [{ items, total, hasMore }, nameFixCount] = await Promise.all([
    listPayers({
      search: q,
      status: statusFilter,
      sector: (sector || undefined) as PayerSector | undefined,
      invoiceStatus: (invoiceStatus || undefined) as InvoiceStatus | undefined,
      debt: (debt || undefined) as PayerDebtFilter | undefined,
      street: street || undefined,
      sort: sort as PayerSort,
      needsNameFix: nameFix || undefined,
      page,
      perPage,
    }),
    countPayersNeedingNameFix(),
  ]);

  const qp = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ q, status, sector, invoiceStatus, debt, street, sort, nameFix: nameFix ? "1" : "", perPage: perPage === 50 ? "" : String(perPage), ...overrides });
    for (const [k, v] of [...p.entries()]) if (!v || v === "name") p.delete(k);
    return `?${p.toString()}`;
  };
  const activeFilterCount = [status, sector, invoiceStatus, debt, street].filter(Boolean).length;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Plătitori</h1>
          <p className="mt-1 text-sm text-ink-soft">{total} plătitori Apă-Canal — facturi, tichete, cont portal.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            entity="payers"
            params={{
              q: q || undefined,
              status: statusFilter,
              sector: sector || undefined,
              invoiceStatus: invoiceStatus || undefined,
              debt: debt || undefined,
              street: street || undefined,
              nameFix: nameFix ? "1" : undefined,
            }}
          />
          {canImport && <ImportButton entity="payers" hideAi />}
        </div>
      </div>

      {nameFixCount > 0 && (
        <Link
          href={qp({ nameFix: nameFix ? "" : "1", page: "1" })}
          className={`tap mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            nameFix ? "border-brand bg-brand-soft text-brand-strong" : "border-st-progress/30 bg-st-progress/10 text-st-progress"
          }`}
        >
          <span>
            <b>{nameFixCount} nume</b> conțin un caracter „?” — litere românești (Ș/Ț) pe care exportul original nu le putea reprezenta.
          </span>
          <span className="shrink-0 font-medium underline">{nameFix ? "Arată pe toți" : "Arată-le"}</span>
        </Link>
      )}

      <form className="mb-4 flex flex-col gap-2" method="GET">
        {nameFix && <input type="hidden" name="nameFix" value="1" />}
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Caută nume, cont personal, email…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand"
          />
          <input
            name="street"
            defaultValue={street}
            placeholder="Stradă / adresă…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={status} className={selectCls}>
            <option value="">Toți (cont)</option>
            <option value="activated">Activați</option>
            <option value="pending">Neactivați</option>
          </select>
          <select name="sector" defaultValue={sector} className={selectCls}>
            <option value="">Toate sectoarele</option>
            {SECTORS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select name="invoiceStatus" defaultValue={invoiceStatus} className={selectCls}>
            <option value="">Toate statusurile</option>
            {INVOICE_STATUS_LIST.map((s) => (
              <option key={s} value={s}>{INVOICE_STATUS[s].label}</option>
            ))}
          </select>
          <select name="debt" defaultValue={debt} className={selectCls}>
            <option value="">Sold: toate</option>
            {DEBT_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <select name="sort" defaultValue={sort} className={selectCls}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select name="perPage" defaultValue={String(perPage)} className={selectCls} aria-label="Câți pe pagină">
            {[...new Set<number>([...PER_PAGE_OPTIONS, perPage])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n} / pagină</option>
            ))}
          </select>
          <button type="submit" className="tap h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
            Filtrează
          </button>
          {activeFilterCount > 0 && (
            <Link href="/platitori" className="tap h-11 rounded-xl border border-[var(--color-line)] px-4 text-sm font-medium text-ink-soft hover:bg-[var(--color-surface-2)] flex items-center">
              Resetează ({activeFilterCount})
            </Link>
          )}
        </div>
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
                  {/* meterSeries = numărul contractului cu care clientul se loghează în portal
                      (vezi pagina de detaliu) — "Cont personal", nu "Serie contor". */}
                  Cont personal: {p.meterSeries} · {p.email || "fără email"} ·{" "}
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
          <span className="text-center text-sm text-ink-soft">
            Pagina {page} din {Math.max(1, Math.ceil(total / perPage))}
            <br />
            <span className="text-xs">{(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} din {total}</span>
          </span>
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
