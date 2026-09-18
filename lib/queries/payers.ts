import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import type { InvoiceStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

export type PayerRow = {
  id: string;
  name: string;
  meterSeries: string | null;
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
  page?: number;
};

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
export async function listPayers(opts: ListPayersOpts = {}) {
  if (DEMO) return { items: [] as PayerRow[], total: 0, page: 1, hasMore: false };

  const page = Math.max(1, opts.page ?? 1);
  const search = opts.search?.trim();
  const street = opts.street?.trim();
  const nameFixIds = opts.needsNameFix ? await findClientIdsNeedingNameFix() : null;

  const where: Prisma.ClientWhereInput = {
    meterSeries: { not: null },
    ...(nameFixIds ? { id: { in: nameFixIds } } : {}),
    ...(opts.status === "activated" ? { portalPasswordHash: { not: null } } : {}),
    ...(opts.status === "pending" ? { portalPasswordHash: null } : {}),
    ...(opts.sector ? { lastInvoiceSectorNr: SECTOR_VALUE[opts.sector] } : {}),
    ...(opts.invoiceStatus ? { lastInvoiceStatus: opts.invoiceStatus } : {}),
    ...(opts.debt === "has" ? { lastInvoiceGrandTotal: { gt: 0 } } : {}),
    ...(opts.debt === "none" ? { lastInvoiceGrandTotal: { lte: 0 } } : {}),
    ...(street ? { consumAddress: { contains: street, mode: "insensitive" as const } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { meterSeries: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, meterSeries: true, email: true, phone: true, portalPasswordHash: true },
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

  return { items: rows, total, page, hasMore: page * PAGE_SIZE < total };
}

export type PayerDetail = {
  id: string;
  name: string;
  meterSeries: string | null;
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
  if (!c || !c.meterSeries) return null;
  return {
    id: c.id,
    name: c.name,
    meterSeries: c.meterSeries,
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
