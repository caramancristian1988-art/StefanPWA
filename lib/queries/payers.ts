import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import type { InvoiceStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 50;
/** Câți plătitori pe pagină alege utilizatorul (?perPage=) — plafonat ca să nu încărcăm mii de rânduri odată. */
export const PER_PAGE_OPTIONS = [20, 50, 100, 200, 500] as const;
export function normalizePerPage(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return PAGE_SIZE;
  return Math.min(n, 500);
}

export type PayerRow = {
  id: string;
  name: string;
  meterSeries: string | null;
  /** Nr. contract 1C — la firmele fără cont personal (identitatea lor). */
  contract: string | null;
  email: string | null;
  phone: string | null;
  activated: boolean;
  invoiceCount: number;
  latestInvoice: { number: string; status: InvoiceStatus; grandTotal: number; currency: string } | null;
};

export type PayerSector = "privat" | "comunal";
export type PayerDebtFilter = "has" | "none";
export type PayerSort = "name" | "debtDesc" | "debtAsc";

const SECTOR_VALUE: Record<PayerSector, string> = {
  privat: "Sector privat",
  comunal: "Sector comunal",
};

export type ListPayersOpts = {
  search?: string;
  status?: "activated" | "pending";
  sector?: PayerSector;
  invoiceStatus?: InvoiceStatus;
  debt?: PayerDebtFilter;
  street?: string;
  sort?: PayerSort;
  /** Nume cu "?" literal — caracter pe care Windows-1251 (codificarea exportului 1C importat)
   * nu îl poate reprezenta deloc (cazul real: Ș/Ț românesc, absente din acea pagină de coduri —
   * pierdere ireversibilă, produsă în sistemul sursă înainte să ajungă fișierul la noi). */
  needsNameFix?: boolean;
  /**
   * "YYYY-MM": doar plătitorii cu factură în luna aceea, afișați cu factura acelei luni; filtrele de sold și
   * status se aplică tot pe factura lunii (nu pe ultima). Fără lună = ultima factură, ca până acum.
   */
  month?: string;
  page?: number;
  perPage?: number;
};

const MONTH_RE = /^\d{4}-\d{2}$/;

export function parsePayerMonth(v: unknown): string | undefined {
  return typeof v === "string" && MONTH_RE.test(v) ? v : undefined;
}

export function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

/** Lunile în care există facturi Apă-Canal, cu numărul de facturi — pentru lista "Luna facturii". */
export async function listPayerMonths(): Promise<{ month: string; count: number }[]> {
  if (DEMO) return [];
  const res = (await prisma.invoice.aggregateRaw({
    pipeline: [
      { $match: { kind: "APA_CANAL" } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$issueDate" } }, n: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ],
  })) as unknown as { _id: string; n: number }[];
  return res.filter((r) => r._id).map((r) => ({ month: r._id, count: r.n }));
}

/** Filtrele de sold/status aplicate pe factura unei luni (în memorie). */
export function matchesMonthInvoice(
  inv: { status: InvoiceStatus; grandTotal: number },
  opts: Pick<ListPayersOpts, "debt" | "invoiceStatus">,
): boolean {
  if (opts.invoiceStatus && inv.status !== opts.invoiceStatus) return false;
  if (opts.debt === "has" && !(inv.grandTotal > 0)) return false;
  if (opts.debt === "none" && inv.grandTotal > 0) return false;
  return true;
}

/**
 * Id-urile clienților al căror nume conține "?" literal — nu putem folosi `contains: "?"` direct
 * (Prisma/MongoDB tratează "?" ca metacaracter de regex acolo, ceea ce ajunge să se potrivească
 * practic cu ORICE nume) — scanăm în memorie (proiecție ușoară, id+nume, ~19k rânduri, rapid).
 */
export async function countPayersNeedingNameFix(): Promise<number> {
  if (DEMO) return 0;
  return (await findClientIdsNeedingNameFix()).length;
}

async function findClientIdsNeedingNameFix(): Promise<string[]> {
  const all = await prisma.client.findMany({
    where: { meterSeries: { not: null } },
    select: { id: true, name: true },
  });
  return all.filter((c) => c.name.includes("?")).map((c) => c.id);
}

/**
 * Plătitori — clienți portal Apă-Canal (au `meterSeries`), separați de clienții obișnuiți
 * (programări) din /clients. Listă paginată + căutare, cu numărul de facturi și starea celei
 * mai recente.
 *
 * Filtrele de sold/status/sector/sortare citesc direct câmpurile Client.lastInvoice* (instantaneu
 * al ultimei facturi, reîmprospătat la fiecare creare/editare — vezi refreshClientInvoiceSnapshot
 * în lib/services/invoices.ts) — MongoDB/Prisma nu poate filtra sau sorta clienți după un câmp
 * dintr-o relație (Invoice) direct, iar la 19k+ plătitori un query per client ar fi mult prea lent.
 */
/**
 * Aceleași filtre ca listPayers — extras separat ca export/route.ts să poată exporta exact
 * ce vede staff-ul pe ecran (aceleași filtre active), nu întreaga listă de plătitori.
 */
export async function buildPayerWhere(opts: ListPayersOpts = {}): Promise<Prisma.ClientWhereInput> {
  const search = opts.search?.trim();
  const street = opts.street?.trim();
  const nameFixIds = opts.needsNameFix ? await findClientIdsNeedingNameFix() : null;

  return {
    // Plătitori = abonații Apă-Canal: persoanele (cont personal) și firmele/instituțiile (nr. contract 1C).
    AND: [
      { OR: [{ meterSeries: { not: null } }, { apaCanalContract: { not: null } }] },
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { meterSeries: { contains: search, mode: "insensitive" as const } },
                { apaCanalContract: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
    ...(nameFixIds ? { id: { in: nameFixIds } } : {}),
    ...(opts.status === "activated" ? { portalPasswordHash: { not: null } } : {}),
    ...(opts.status === "pending" ? { portalPasswordHash: null } : {}),
    ...(opts.sector ? { lastInvoiceSectorNr: SECTOR_VALUE[opts.sector] } : {}),
    ...(opts.invoiceStatus ? { lastInvoiceStatus: opts.invoiceStatus } : {}),
    ...(opts.debt === "has" ? { lastInvoiceGrandTotal: { gt: 0 } } : {}),
    ...(opts.debt === "none" ? { lastInvoiceGrandTotal: { lte: 0 } } : {}),
    ...(street ? { consumAddress: { contains: street, mode: "insensitive" as const } } : {}),
  };
}

export async function listPayers(opts: ListPayersOpts = {}) {
  if (DEMO) return { items: [] as PayerRow[], total: 0, page: 1, hasMore: false };

  const page = Math.max(1, opts.page ?? 1);
  const perPage = normalizePerPage(opts.perPage);
  const month = parsePayerMonth(opts.month);
  if (month) return listPayersForMonth(month, opts, page, perPage);
  const where = await buildPayerWhere(opts);

  const orderBy: Prisma.ClientOrderByWithRelationInput =
    opts.sort === "debtDesc"
      ? { lastInvoiceGrandTotal: "desc" }
      : opts.sort === "debtAsc"
        ? { lastInvoiceGrandTotal: "asc" }
        : { name: "asc" };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, name: true, meterSeries: true, apaCanalContract: true, email: true, phone: true, portalPasswordHash: true },
    }),
    prisma.client.count({ where }),
  ]);

  const ids = items.map((c) => c.id);
  const invoices = ids.length
    ? await prisma.invoice.findMany({
        where: { clientId: { in: ids } },
        orderBy: { issueDate: "desc" },
        select: { clientId: true, number: true, status: true, grandTotal: true, currency: true },
      })
    : [];

  const byClient = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = byClient.get(inv.clientId!) ?? [];
    list.push(inv);
    byClient.set(inv.clientId!, list);
  }

  const rows: PayerRow[] = items.map((c) => {
    const clientInvoices = byClient.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      meterSeries: c.meterSeries,
      contract: c.apaCanalContract,
      email: c.email,
      phone: c.phone,
      activated: !!c.portalPasswordHash,
      invoiceCount: clientInvoices.length,
      latestInvoice: clientInvoices[0]
        ? {
            number: clientInvoices[0].number,
            status: clientInvoices[0].status,
            grandTotal: clientInvoices[0].grandTotal,
            currency: clientInvoices[0].currency,
          }
        : null,
    };
  });

  return { items: rows, total, page, perPage, hasMore: page * perPage < total };
}

const collator = new Intl.Collator("ro");

/**
 * Lista pentru o lună anume. Potrivirea plătitor ↔ factura lunii se face în memorie: un filtru
 * `id: { in: [~19.000 de id-uri] }` durează ~80 s în MongoDB (măsurat), deci aducem proiecții mici
 * (clienți filtrați + facturile lunii), le potrivim aici și citim din bază doar rândurile paginii.
 */
async function listPayersForMonth(month: string, opts: ListPayersOpts, page: number, perPage: number) {
  const where = await buildPayerWhere({ ...opts, debt: undefined, invoiceStatus: undefined });
  const [clients, monthInvoices] = await Promise.all([
    prisma.client.findMany({ where, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: { kind: "APA_CANAL", issueDate: monthRange(month), clientId: { not: null } },
      orderBy: { issueDate: "desc" },
      select: { clientId: true, number: true, status: true, grandTotal: true, currency: true },
    }),
  ]);
  const invByClient = new Map<string, (typeof monthInvoices)[number]>();
  for (const inv of monthInvoices) if (inv.clientId && !invByClient.has(inv.clientId)) invByClient.set(inv.clientId, inv);

  const matched = clients.filter((c) => {
    const inv = invByClient.get(c.id);
    return inv && matchesMonthInvoice(inv, opts);
  });
  if (opts.sort === "debtDesc" || opts.sort === "debtAsc") {
    const mul = opts.sort === "debtAsc" ? 1 : -1;
    matched.sort((a, b) => (invByClient.get(a.id)!.grandTotal - invByClient.get(b.id)!.grandTotal) * mul || collator.compare(a.name, b.name));
  } else {
    matched.sort((a, b) => collator.compare(a.name, b.name));
  }

  const total = matched.length;
  const ids = matched.slice((page - 1) * perPage, page * perPage).map((c) => c.id);
  const [pageClients, counts] = ids.length
    ? await Promise.all([
        prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, meterSeries: true, apaCanalContract: true, email: true, phone: true, portalPasswordHash: true } }),
        prisma.invoice.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: { _all: true } }),
      ])
    : [[], []];
  const byId = new Map(pageClients.map((c) => [c.id, c]));
  const countBy = new Map(counts.map((c) => [c.clientId, c._count._all]));

  const rows: PayerRow[] = ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => {
      const inv = invByClient.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        meterSeries: c.meterSeries,
        contract: c.apaCanalContract,
        email: c.email,
        phone: c.phone,
        activated: !!c.portalPasswordHash,
        invoiceCount: countBy.get(c.id) ?? 0,
        latestInvoice: { number: inv.number, status: inv.status, grandTotal: inv.grandTotal, currency: inv.currency },
      };
    });

  return { items: rows, total, page, perPage, hasMore: page * perPage < total };
}

export type PayerDetail = {
  id: string;
  name: string;
  meterSeries: string | null;
  /** Nr. contract 1C — la firmele fără cont personal. */
  contract: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  activated: boolean;
  portalActivatedAt: Date | null;
  portalLastLoginAt: Date | null;
  meterNumber: string | null;
  meterCurrReading: number | null;
  consumAddress: string | null;
};

export async function getPayer(id: string): Promise<PayerDetail | null> {
  if (DEMO) return null;
  const c = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      meterSeries: true,
      apaCanalContract: true,
      email: true,
      phone: true,
      notes: true,
      portalPasswordHash: true,
      portalActivatedAt: true,
      portalLastLoginAt: true,
      meterNumber: true,
      meterCurrReading: true,
      consumAddress: true,
    },
  });
  if (!c || (!c.meterSeries && !c.apaCanalContract)) return null;
  return {
    id: c.id,
    name: c.name,
    meterSeries: c.meterSeries,
    contract: c.apaCanalContract,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    activated: !!c.portalPasswordHash,
    portalActivatedAt: c.portalActivatedAt,
    portalLastLoginAt: c.portalLastLoginAt,
    meterNumber: c.meterNumber,
    meterCurrReading: c.meterCurrReading,
    consumAddress: c.consumAddress,
  };
}

export async function getPayerInvoices(clientId: string) {
  return prisma.invoice.findMany({
    where: { clientId },
    orderBy: { issueDate: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      grandTotal: true,
      currency: true,
      issueDate: true,
      publicToken: true,
      meterCurrReading: true,
      meterPrevReading: true,
      billingPeriodLabel: true,
      subtotal: true,
      datoriiAvans: true,
      kind: true,
    },
  });
}

export async function getPayerTickets(clientId: string) {
  return prisma.task.findMany({
    where: { clientId, type: "TICKET" },
    orderBy: { createdAt: "desc" },
    select: { id: true, seq: true, title: true, status: true, createdAt: true },
  });
}
