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
  /** "YYYY-MM-DD" instalării contorului activ (din 1C) — completat doar când sortarea/filtrarea
   * cerută îl folosește (vezi installDateMap); altfel rămâne null, fără cost suplimentar. */
  installedAt: string | null;
};

export type PayerSector = "privat" | "comunal";
export type PayerDebtFilter = "has" | "none";
export type PayerSort = "name" | "debtDesc" | "debtAsc" | "installDesc" | "installAsc";

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
  /** "YYYY-MM-DD": doar plătitorii cu contorul activ instalat la sau după data asta (din 1C). */
  installedFrom?: string;
  page?: number;
  perPage?: number;
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePayerMonth(v: unknown): string | undefined {
  return typeof v === "string" && MONTH_RE.test(v) ? v : undefined;
}

export function parseInstalledFrom(v: unknown): string | undefined {
  return typeof v === "string" && DATE_RE.test(v) ? v : undefined;
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

/** Data instalării contorului activ, per client — din OneCRecord (1C); Client n-o are (ar cere
 * resincronizare la fiecare import). Citită doar când sortarea/filtrarea cerută o folosește —
 * proiecție mică (id+dată) chiar și pe toți cei ~19k plătitori, deci ieftină la cerere. */
async function installDateMap(): Promise<Map<string, string | null>> {
  const rows = await prisma.oneCRecord.findMany({
    where: { clientId: { not: null } },
    select: { clientId: true, dataInstalare: true },
  });
  const m = new Map<string, string | null>();
  for (const r of rows) if (r.clientId) m.set(r.clientId, r.dataInstalare);
  return m;
}

/** Sortare după data instalării (string "YYYY-MM-DD", comparabil lexicografic) — fără dată cunoscută
 * trece mereu la final, indiferent de direcție (altfel "cele mai vechi" ar scoate în față exact
 * clienții fără informație, care nu sunt "vechi", sunt necunoscuți). */
function sortByInstall<T extends { id: string; name: string }>(
  items: T[],
  installBy: Map<string, string | null>,
  dir: 1 | -1,
): T[] {
  return [...items].sort((a, b) => {
    const da = installBy.get(a.id) ?? "";
    const db = installBy.get(b.id) ?? "";
    if (!da && !db) return collator.compare(a.name, b.name);
    if (!da) return 1;
    if (!db) return -1;
    return (da < db ? -1 : da > db ? 1 : 0) * dir || collator.compare(a.name, b.name);
  });
}

export async function listPayers(opts: ListPayersOpts = {}) {
  if (DEMO) return { items: [] as PayerRow[], total: 0, page: 1, hasMore: false };

  const page = Math.max(1, opts.page ?? 1);
  const perPage = normalizePerPage(opts.perPage);
  const month = parsePayerMonth(opts.month);
  const installedFrom = parseInstalledFrom(opts.installedFrom);
  const installSort = opts.sort === "installDesc" || opts.sort === "installAsc";
  if (month) return listPayersForMonth(month, { ...opts, installedFrom }, page, perPage);
  if (installSort || installedFrom) return listPayersByInstall(opts, installedFrom, page, perPage);
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
      installedAt: null,
    };
  });

  return { items: rows, total, page, perPage, hasMore: page * perPage < total };
}

/**
 * Sortare "Instalare: recente/vechi" sau filtrul "instalați de la" — necesită alăturare cu
 * OneCRecord (1C), care nu poate fi exprimată într-un `where` Prisma pe Client (colecții diferite
 * în MongoDB). La fel ca listPayersForMonth: aducem id-urile filtrate + mapa de date, sortăm/
 * paginăm în memorie, apoi hidratăm doar pagina cerută (nu toți ~19k dintr-o dată).
 */
async function listPayersByInstall(opts: ListPayersOpts, installedFrom: string | undefined, page: number, perPage: number) {
  const where = await buildPayerWhere(opts);
  const [clients, installBy] = await Promise.all([
    prisma.client.findMany({ where, select: { id: true, name: true } }),
    installDateMap(),
  ]);

  let matched = clients;
  if (installedFrom) {
    matched = matched.filter((c) => {
      const d = installBy.get(c.id);
      return !!d && d >= installedFrom;
    });
  }
  matched = sortByInstall(matched, installBy, opts.sort === "installAsc" ? 1 : -1);

  const total = matched.length;
  const ids = matched.slice((page - 1) * perPage, page * perPage).map((c) => c.id);
  const rows = await hydratePayerRows(ids, installBy);
  return { items: rows, total, page, perPage, hasMore: page * perPage < total };
}

/** Hidratează un set de id-uri (deja sortate/paginate) cu toate câmpurile unui PayerRow —
 * folosit de listPayersByInstall; păstrează ORDINEA din `ids` (Mongo nu garantează ordinea
 * rezultatelor pentru `id: { in: [...] }`). */
async function hydratePayerRows(ids: string[], installBy?: Map<string, string | null>): Promise<PayerRow[]> {
  if (!ids.length) return [];
  const [clients, invoices] = await Promise.all([
    prisma.client.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, meterSeries: true, apaCanalContract: true, email: true, phone: true, portalPasswordHash: true },
    }),
    prisma.invoice.findMany({
      where: { clientId: { in: ids } },
      orderBy: { issueDate: "desc" },
      select: { clientId: true, number: true, status: true, grandTotal: true, currency: true },
    }),
  ]);
  const byId = new Map(clients.map((c) => [c.id, c]));
  const invByClient = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = invByClient.get(inv.clientId!) ?? [];
    list.push(inv);
    invByClient.set(inv.clientId!, list);
  }
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => {
      const clientInvoices = invByClient.get(c.id) ?? [];
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
          ? { number: clientInvoices[0].number, status: clientInvoices[0].status, grandTotal: clientInvoices[0].grandTotal, currency: clientInvoices[0].currency }
          : null,
        installedAt: installBy?.get(c.id) ?? null,
      };
    });
}

const collator = new Intl.Collator("ro");

/**
 * Lista pentru o lună anume. Potrivirea plătitor ↔ factura lunii se face în memorie: un filtru
 * `id: { in: [~19.000 de id-uri] }` durează ~80 s în MongoDB (măsurat), deci aducem proiecții mici
 * (clienți filtrați + facturile lunii), le potrivim aici și citim din bază doar rândurile paginii.
 */
async function listPayersForMonth(month: string, opts: ListPayersOpts, page: number, perPage: number) {
  const installedFrom = parseInstalledFrom(opts.installedFrom);
  const needsInstall = installedFrom || opts.sort === "installDesc" || opts.sort === "installAsc";
  const where = await buildPayerWhere({ ...opts, debt: undefined, invoiceStatus: undefined });
  const [clients, monthInvoices, installBy] = await Promise.all([
    prisma.client.findMany({ where, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: { kind: "APA_CANAL", issueDate: monthRange(month), clientId: { not: null } },
      orderBy: { issueDate: "desc" },
      select: { clientId: true, number: true, status: true, grandTotal: true, currency: true },
    }),
    needsInstall ? installDateMap() : Promise.resolve(new Map<string, string | null>()),
  ]);
  const invByClient = new Map<string, (typeof monthInvoices)[number]>();
  for (const inv of monthInvoices) if (inv.clientId && !invByClient.has(inv.clientId)) invByClient.set(inv.clientId, inv);

  let matched = clients.filter((c) => {
    const inv = invByClient.get(c.id);
    return inv && matchesMonthInvoice(inv, opts);
  });
  if (installedFrom) {
    matched = matched.filter((c) => {
      const d = installBy.get(c.id);
      return !!d && d >= installedFrom;
    });
  }
  if (opts.sort === "debtDesc" || opts.sort === "debtAsc") {
    const mul = opts.sort === "debtAsc" ? 1 : -1;
    matched.sort((a, b) => (invByClient.get(a.id)!.grandTotal - invByClient.get(b.id)!.grandTotal) * mul || collator.compare(a.name, b.name));
  } else if (opts.sort === "installDesc" || opts.sort === "installAsc") {
    matched = sortByInstall(matched, installBy, opts.sort === "installAsc" ? 1 : -1);
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
        installedAt: needsInstall ? (installBy.get(c.id) ?? null) : null,
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
