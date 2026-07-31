import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import type { InvoiceStatus } from "@prisma/client";

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

/**
 * Plătitori — clienți portal Apă-Canal (au `meterSeries`), separați de clienții obișnuiți
 * (programări) din /clients. Listă paginată + căutare, cu numărul de facturi și starea celei
 * mai recente, calculate într-o singură interogare suplimentară (nu N+1 per rând).
 */
export async function listPayers(opts: { search?: string; status?: "activated" | "pending"; page?: number } = {}) {
  if (DEMO) return { items: [] as PayerRow[], total: 0, page: 1, hasMore: false };

  const page = Math.max(1, opts.page ?? 1);
  const search = opts.search?.trim();

  const where = {
    meterSeries: { not: null },
    ...(opts.status === "activated" ? { portalPasswordHash: { not: null } } : {}),
    ...(opts.status === "pending" ? { portalPasswordHash: null } : {}),
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

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
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
