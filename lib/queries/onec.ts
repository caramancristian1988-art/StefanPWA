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

const collator = new Intl.Collator("ro");
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sortarea și paginarea se fac aici, nu în MongoDB: un sort pe server peste documente cu liste mari
 * (consumatori/contoare) depășește limita de memorie de 32 MB de îndată ce sari peste câteva mii de
 * rânduri (ultimele pagini, coloană fără index). Aducem doar perechile mici (id, coloana de sortare,
 * cele 3 sume), le sortăm în memorie, iar din baza de date citim numai rândurile paginii curente.
 * Bonus: ordinea e aceeași pe toate paginile și pe toate coloanele, iar totalurile vin din același set.
 */
export async function listOneC(q: OneCQuery) {
  const where = await buildOneCWhere(q);
  const col = COLS.get(q.sort) ?? COLS.get("nume")!;
  const select: Record<string, true> = { id: true, uid: true, calculat: true, datorieAvans: true, deAchitat: true, [col.key]: true };
  const all = (await prisma.oneCRecord.findMany({ where, select: select as Prisma.OneCRecordSelect })) as unknown as Record<string, string | number | null>[];

  const mul = q.dir === "asc" ? 1 : -1;
  all.sort((x, y) => {
    const a = x[col.key], b = y[col.key];
    let c: number;
    if (a == null && b == null) c = 0;
    else if (a == null) c = -1;
    else if (b == null) c = 1;
    else c = col.type === "num" ? Number(a) - Number(b) : collator.compare(String(a), String(b));
    return c * mul || collator.compare(String(x.uid), String(y.uid));
  });

  let calculat = 0, datorieAvans = 0, deAchitat = 0;
  for (const r of all) {
    calculat += Number(r.calculat) || 0;
    datorieAvans += Number(r.datorieAvans) || 0;
    deAchitat += Number(r.deAchitat) || 0;
  }

  const skip = (q.page - 1) * q.perPage;
  const ids = all.slice(skip, skip + q.perPage).map((r) => String(r.id));
  const rows = ids.length
    ? ((await prisma.oneCRecord.findMany({ where: { id: { in: ids } }, select: SELECT as Prisma.OneCRecordSelect })) as unknown as (Record<string, string | number | null> & { id: string })[])
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

  const numbers = ordered.map((r) => r.invoiceNumber).filter((n): n is string => typeof n === "string" && n !== "");
  const invs = numbers.length
    ? await prisma.invoice.findMany({ where: { number: { in: numbers } }, select: { number: true, grandTotal: true } })
    : [];
  const pwa = new Map(invs.map((i) => [i.number, i.grandTotal]));

  const items = ordered.map((r) => {
    const pwaTotal = typeof r.invoiceNumber === "string" && r.invoiceNumber ? pwa.get(r.invoiceNumber) ?? null : null;
    const de = Number(r.deAchitat) || 0;
    return { ...r, pwaTotal, diff: pwaTotal == null ? null : round2(pwaTotal - de) } as OneCRow;
  });

  return {
    items,
    total: all.length,
    page: q.page,
    perPage: q.perPage,
    sums: { calculat: round2(calculat), datorieAvans: round2(datorieAvans), deAchitat: round2(deAchitat) },
  };
}

/**
 * Detaliile (rândurile brute din tabelele-copil) ale unui abonat, după id, plus unde poate fi deschis
 * în PWA: fișa de plătitor există doar pentru cei cu cont personal (firmele importate fără cont nu
 * apar în Plătitori), iar factura o găsim după număr.
 */
export async function getOneCDetail(id: string) {
  const rec = await prisma.oneCRecord.findUnique({
    where: { id },
    select: { id: true, uid: true, nume: true, clientId: true, invoiceNumber: true, consumers: true, meters: true, readings: true, lines: true },
  });
  if (!rec) return null;
  const [payer, invoice] = await Promise.all([
    rec.clientId ? prisma.client.findFirst({ where: { id: rec.clientId, meterSeries: { not: null } }, select: { id: true } }) : null,
    rec.invoiceNumber ? prisma.invoice.findFirst({ where: { number: rec.invoiceNumber }, select: { id: true } }) : null,
  ]);
  return { ...rec, payerId: payer?.id ?? null, invoiceId: invoice?.id ?? null };
}
