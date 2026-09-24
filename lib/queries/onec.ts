import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ONEC_COLUMNS, type OneCColumn } from "../apa-canal-1c";

export const ONEC_PER_PAGE_OPTIONS = [50, 100, 200, 500] as const;
const MAX_PER_PAGE = 500;
const TOLERANCE = 0.011;

export type OneCQuery = {
  /** Filtre per coloană: cheie → text tastat în capul de tabel. */
  filters: Record<string, string>;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  perPage: number;
  /** Doar abonații la care "De achitat" din 1C diferă de totalul facturii din PWA. */
  onlyDiff: boolean;
};

const COLS = new Map(ONEC_COLUMNS.map((c) => [c.key, c]));

export function parseOneCQuery(sp: URLSearchParams): OneCQuery {
  const filters: Record<string, string> = {};
  for (const c of ONEC_COLUMNS) {
    const v = (sp.get(`f_${c.key}`) ?? "").trim();
    if (v) filters[c.key] = v;
  }
  const sort = COLS.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "nume";
  const perPageRaw = Math.floor(Number(sp.get("perPage")));
  return {
    filters,
    sort,
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Math.floor(Number(sp.get("page"))) || 1),
    perPage: Number.isFinite(perPageRaw) && perPageRaw > 0 ? Math.min(perPageRaw, MAX_PER_PAGE) : 100,
    onlyDiff: sp.get("diff") === "1",
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Filtru numeric: `>100`, `>=100`, `<5`, `<=5`, `=45.3`, `10-20` (interval) sau doar `45.3` (egal).
 * Întoarce null dacă textul nu e un număr/operator valid (filtrul se ignoră, nu strică lista).
 */
function numericFilter(raw: string): Prisma.FloatNullableFilter | null {
  const s = raw.replace(/\s+/g, "").replace(/,/g, ".");
  let m = s.match(/^(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === ">") return { gt: n };
    if (m[1] === ">=") return { gte: n };
    if (m[1] === "<") return { lt: n };
    if (m[1] === "<=") return { lte: n };
    return { gte: n - 0.005, lte: n + 0.005 };
  }
  m = s.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
  if (m) return { gte: Number(m[1]), lte: Number(m[2]) };
  m = s.match(/^-?\d+(?:\.\d+)?$/);
  if (m) {
    const n = Number(s);
    return { gte: n - 0.005, lte: n + 0.005 };
  }
  return null;
}

async function diffInvoiceNumbers(): Promise<string[]> {
  const [recs, invs] = await Promise.all([
    prisma.oneCRecord.findMany({ select: { invoiceNumber: true, deAchitat: true } }),
    prisma.invoice.findMany({ where: { kind: "APA_CANAL" }, select: { number: true, grandTotal: true } }),
  ]);
  const total = new Map(invs.map((i) => [i.number, i.grandTotal]));
  const out: string[] = [];
  for (const r of recs) {
    if (!r.invoiceNumber) continue;
    const pwa = total.get(r.invoiceNumber);
    if (pwa == null || Math.abs(pwa - (r.deAchitat ?? 0)) > TOLERANCE) out.push(r.invoiceNumber);
  }
  return out;
}

export async function buildOneCWhere(q: Pick<OneCQuery, "filters" | "onlyDiff">): Promise<Prisma.OneCRecordWhereInput> {
  const and: Prisma.OneCRecordWhereInput[] = [];
  for (const [key, value] of Object.entries(q.filters)) {
    const col: OneCColumn | undefined = COLS.get(key);
    if (!col) continue;
    if (col.type === "num") {
      const f = numericFilter(value);
      if (f) and.push({ [key]: f });
    } else {
      and.push({ [key]: { contains: escapeRegex(value), mode: "insensitive" } });
    }
  }
  if (q.onlyDiff) and.push({ invoiceNumber: { in: await diffInvoiceNumbers() } });
  return and.length ? { AND: and } : {};
}

export type OneCRow = Record<string, string | number | null> & {
  id: string;
  clientId: string | null;
  invoiceNumber: string | null;
  /** Total al facturii din PWA (live) și diferența față de "De achitat" din 1C. */
  pwaTotal: number | null;
  diff: number | null;
};

const SELECT: Record<string, true> = { id: true, clientId: true, invoiceNumber: true };
for (const c of ONEC_COLUMNS) SELECT[c.key] = true;

export async function listOneC(q: OneCQuery) {
  const where = await buildOneCWhere(q);
  const orderBy = [{ [q.sort]: q.dir }, { uid: "asc" }] as Prisma.OneCRecordOrderByWithRelationInput[];

  const [rows, total, sums] = await Promise.all([
    prisma.oneCRecord.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      select: SELECT as Prisma.OneCRecordSelect,
    }),
    prisma.oneCRecord.count({ where }),
    prisma.oneCRecord.aggregate({ where, _sum: { calculat: true, datorieAvans: true, deAchitat: true } }),
  ]);

  const numbers = rows.map((r) => r.invoiceNumber).filter((n): n is string => !!n);
  const invs = numbers.length
    ? await prisma.invoice.findMany({ where: { number: { in: numbers } }, select: { number: true, grandTotal: true } })
    : [];
  const pwa = new Map(invs.map((i) => [i.number, i.grandTotal]));

  const items = rows.map((r) => {
    const pwaTotal = r.invoiceNumber ? pwa.get(r.invoiceNumber) ?? null : null;
    const de = (r as { deAchitat?: number | null }).deAchitat ?? 0;
    return {
      ...(r as unknown as Record<string, string | number | null>),
      pwaTotal,
      diff: pwaTotal == null ? null : Math.round((pwaTotal - de + Number.EPSILON) * 100) / 100,
    } as OneCRow;
  });

  return {
    items,
    total,
    page: q.page,
    perPage: q.perPage,
    sums: {
      calculat: sums._sum.calculat ?? 0,
      datorieAvans: sums._sum.datorieAvans ?? 0,
      deAchitat: sums._sum.deAchitat ?? 0,
    },
  };
}

/** Detaliile (rândurile brute din tabelele-copil) ale unui abonat, după id. */
export async function getOneCDetail(id: string) {
  return prisma.oneCRecord.findUnique({
    where: { id },
    select: { id: true, uid: true, nume: true, clientId: true, invoiceNumber: true, consumers: true, meters: true, readings: true, lines: true },
  });
}
