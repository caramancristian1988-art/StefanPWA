import "server-only";
import { randomBytes } from "node:crypto";
import iconv from "iconv-lite";
import { ObjectId } from "mongodb";
import type { Prisma } from "@prisma/client";

/**
 * Import date Apă-Canal dintr-un export 1C (JSON, de regulă codificat Windows-1251) — formatul
 * folosit de scripts/import-apa-canal-cahul-april2024.mjs pentru importul inițial (18.261
 * abonați, aprilie 2024). Acest modul e nucleul REFOLOSIT de API-ul de import (POST
 * /api/import/apa-canal-json) — scriptul CLI rămâne neatins (a rulat deja o dată, cu succes,
 * peste baza de producție) ca să nu riscăm să stricăm ceva ce deja funcționează.
 *
 * Fișierul are 6 tabele legate prin UID:
 *   Документы (Documente)            — sold/factură curentă (Начислено/ОплаченоДолг/СуммаКОплате)
 *   Абоненты (Abonenți)              — nume/contract/cont personal/adresă/telefon
 *   Потребители (Consumatori)        — zonă presiune apă/sector
 *   ИзмерительныеПриборы (Contoare)  — nr. contor, dată instalare/demontare
 *   Потребления (Citiri)             — citire precedentă/curentă
 *   РасчетСумм (Calcul sume)         — linii de facturare (apă/canal)
 */

export type ApaCanalRawData = {
  documente: Record<string, unknown>[];
  abonenti: Record<string, unknown>[];
  consumatori: Record<string, unknown>[];
  contoare: Record<string, unknown>[];
  citiri: Record<string, unknown>[];
  calculeSume: Record<string, unknown>[];
};

const LUNI_RO = [
  "IANUARIE", "FEBRUARIE", "MARTIE", "APRILIE", "MAI", "IUNIE",
  "IULIE", "AUGUST", "SEPTEMBRIE", "OCTOMBRIE", "NOIEMBRIE", "DECEMBRIE",
];

const SERVICE_RO: Record<string, string> = {
  "Потребление воды": "Serviciul de alimentare cu apă",
  "Сброс канализации": "Serviciul de canalizare",
};

const SECTOR_RO: Record<string, string> = {
  "Частный": "Sector privat",
  "Коммунальный": "Sector comunal",
};

const round2 = (n: unknown) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const oid = () => new ObjectId().toHexString();
const genToken = () => randomBytes(18).toString("base64url");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const str = (v: unknown) => String(v ?? "").trim();
const pad5 = (n: unknown) => {
  const s = String(Math.trunc(Number(n) || 0));
  return s.length < 5 ? s.padStart(5, "0") : s;
};

/**
 * Decodează bufferul brut. Acceptă atât exportul original (Windows-1251), cât și un JSON deja
 * UTF-8 — încearcă întâi UTF-8 (dacă parsează curat ȘI conține texte non-ASCII valide, adică nu
 * a fost de fapt Windows-1251 citit greșit ca UTF-8), altfel cade pe Windows-1251.
 */
export function parseApaCanalBuffer(buf: Buffer): ApaCanalRawData {
  let obj: Record<string, unknown> | null = null;

  const tryUtf8 = () => {
    const text = buf.toString("utf-8");
    // Windows-1251 citit greșit ca UTF-8 produce caracterul de înlocuire U+FFFD în locul
    // literelor chirilice — dacă apare, nu e UTF-8 valid pentru datele astea.
    if (text.includes("�")) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const tryWin1251 = () => {
    const text = iconv.decode(buf, "win1251");
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  obj = tryUtf8() ?? tryWin1251();
  if (!obj) throw new Error("Fișierul nu este JSON valid (nici UTF-8, nici Windows-1251).");

  const documente = (obj["Документы"] as Record<string, unknown>[]) ?? [];
  const abonenti = (obj["Абоненты"] as Record<string, unknown>[]) ?? [];
  const consumatori = (obj["Потребители"] as Record<string, unknown>[]) ?? [];
  const contoare = (obj["ИзмерительныеПриборы"] as Record<string, unknown>[]) ?? [];
  const citiri = (obj["Потребления"] as Record<string, unknown>[]) ?? [];
  const calculeSume = (obj["РасчетСумм"] as Record<string, unknown>[]) ?? [];

  if (documente.length === 0 || abonenti.length === 0) {
    throw new Error(
      "Fișierul nu conține tabelele așteptate (\"Документы\"/\"Абоненты\") — nu pare exportul 1C Apă-Canal.",
    );
  }

  return { documente, abonenti, consumatori, contoare, citiri, calculeSume };
}

export type ExistingClientLite = {
  id: string;
  name: string;
  meterSeries: string | null;
  portalActivatedAt: Date | null;
};

export type ApaCanalPlanStats = {
  documenteTotale: number;
  sariteFaraAbonent: number;
  clientiNoiDeCreat: number;
  clientiExistentiActualizati: number;
  dinCareCuContActivatPastrat: number;
  coliziuniContPersonal: number;
  facturiDeCreat: number;
  facturiSaritePreexistente: number;
  liniiFacturaDeCreat: number;
  totalNecuvenit: number;
  totalDePlata: number;
};

export type ApaCanalPlan = {
  clientsToCreate: Prisma.ClientCreateManyInput[];
  clientUpdates: { id: string; data: Prisma.ClientUpdateInput }[];
  invoicesToCreate: Prisma.InvoiceCreateManyInput[];
  itemsToCreate: Prisma.InvoiceItemCreateManyInput[];
  stats: ApaCanalPlanStats;
};

/**
 * Construiește planul de import (pur, fără nicio scriere în bază) — id-uri Mongo pre-generate,
 * ca să putem lega facturile/liniile de clienți fără dus-întors la bază per rând.
 *
 * Potrivire client: după nume normalizat, primul potrivit "consumă" acel client existent (un
 * nume care apare de 2 ori în fișier nu va suprascrie de 2 ori același client). Cont personal
 * (Лицевой счет) devine noul Client.meterSeries (cod de login portal) — ÎNSĂ nu se atinge la
 * clienții care și-au activat deja contul (le-ar bloca login-ul), și nici dacă valoarea e deja
 * folosită de alt client (coliziune, foarte rar).
 */
export function buildApaCanalPlan(
  data: ApaCanalRawData,
  ctx: { ownerId: string; existingClients: ExistingClientLite[]; existingInvoiceNumbers: Set<string> },
): ApaCanalPlan {
  const docByUid = new Map(data.documente.map((d) => [str(d.UID), d]));
  const subByUid = new Map(data.abonenti.map((a) => [str(a.UID), a]));

  const consumerByUid = new Map<string, Record<string, unknown>>();
  for (const c of data.consumatori) {
    const uid = str(c.UID);
    const prev = consumerByUid.get(uid);
    if (!prev || str(c["Период"]) > str(prev["Период"])) consumerByUid.set(uid, c);
  }

  const meterByUid = new Map<string, Record<string, unknown>>();
  for (const mtr of data.contoare) {
    const uid = str(mtr.UID);
    const prev = meterByUid.get(uid);
    const active = !mtr["ДатаСнятия"] || str(mtr["ДатаСнятия"]).startsWith("0001-01-01");
    if (!prev) { meterByUid.set(uid, mtr); continue; }
    const prevActive = !prev["ДатаСнятия"] || str(prev["ДатаСнятия"]).startsWith("0001-01-01");
    if (active && !prevActive) { meterByUid.set(uid, mtr); continue; }
    if (active === prevActive && str(mtr["ДатаУстановки"]) > str(prev["ДатаУстановки"])) {
      meterByUid.set(uid, mtr);
    }
  }

  type Reading = { prev: number; curr: number; total: number; dataPokazanii: string; estimat: boolean };
  const readingByUid = new Map<string, Reading>();
  for (const r of data.citiri) {
    const uid = str(r.UID);
    const agg = readingByUid.get(uid) ?? { prev: 0, curr: 0, total: 0, dataPokazanii: "", estimat: false };
    agg.total += Number(r["ИтогПотребления"]) || 0;
    if (str(r["ДатаПоказаний"]) >= agg.dataPokazanii) {
      agg.dataPokazanii = str(r["ДатаПоказаний"]);
      agg.prev = Number(r["ПредыдущиеПоказания"]) || 0;
      agg.curr = Number(r["Показания"]) || 0;
    }
    if (str(r["Источник"]) !== "Контролер") agg.estimat = true;
    readingByUid.set(uid, agg);
  }

  const itemsByUid = new Map<string, Record<string, unknown>[]>();
  for (const it of data.calculeSume) {
    const uid = str(it.UID);
    const arr = itemsByUid.get(uid) ?? [];
    arr.push(it);
    itemsByUid.set(uid, arr);
  }

  const clientByNameKey = new Map(ctx.existingClients.map((c) => [norm(c.name), c]));
  const usedMeterSeries = new Set(ctx.existingClients.map((c) => c.meterSeries).filter(Boolean) as string[]);
  const consumedNames = new Set<string>();
  const existingInvoiceNumbers = new Set(ctx.existingInvoiceNumbers);

  const clientsToCreate: Prisma.ClientCreateManyInput[] = [];
  const clientUpdates: { id: string; data: Prisma.ClientUpdateInput }[] = [];
  const invoicesToCreate: Prisma.InvoiceCreateManyInput[] = [];
  const itemsToCreate: Prisma.InvoiceItemCreateManyInput[] = [];

  let skippedNoDoc = 0;
  let meterSeriesCollisions = 0;
  let preservedActivated = 0;
  let matchedExisting = 0;
  let createdNew = 0;
  let skippedExistingInvoice = 0;

  for (const [uid, doc] of docByUid) {
    const sub = subByUid.get(uid);
    if (!sub) { skippedNoDoc++; continue; }

    const name = str(sub["Наименование"]);
    if (!name) { skippedNoDoc++; continue; }

    const consumer = consumerByUid.get(uid);
    const meter = meterByUid.get(uid);
    const reading = readingByUid.get(uid);
    const items = itemsByUid.get(uid) ?? [];

    const contPersonalRaw = str(sub["ЛицевойСчет"]);
    const phone = str(sub["Телефон"]) || null;
    const consumAddress = [
      str(sub["Город"]),
      str(sub["Улица"]) ? `str. ${str(sub["Улица"])}` : "",
      str(sub["Дом"]) ? `nr. ${str(sub["Дом"])}` : "",
      str(sub["Квартира"]) ? `ap. ${str(sub["Квартира"])}` : "",
    ].filter(Boolean).join(", ") || null;
    const sectorRaw = str(sub["ТипСектора"]) || str(consumer?.["Участок"]);
    const sectorNr = sectorRaw ? (SECTOR_RO[sectorRaw] ?? sectorRaw) : null;
    const meterNumber = meter ? str(meter["ИзмерительныйПрибор"]) || null : null;
    const meterCurrReadingNum = reading ? reading.curr : null;
    const meterReadingEstimated = reading ? reading.estimat : false;

    let meterSeries: string | null = null;
    if (contPersonalRaw) {
      if (!usedMeterSeries.has(contPersonalRaw)) meterSeries = contPersonalRaw;
      else meterSeriesCollisions++;
    }

    // Calculat aici (nu mai jos, la construcția facturii) — Client.lastInvoice* trebuie
    // populat direct la import, ca /platitori (sold, status, sector) să nu depindă de o
    // reîmprospătare ulterioară care rulează doar la creare/editare individuală de factură.
    const issueDate = new Date(str(doc["Дата"]));
    const subtotal = round2(doc["Начислено"]);
    const datoriiAvans = round2(doc["ОплаченоДолг"]);
    const grandTotal = round2(subtotal + datoriiAvans);

    const nameKey = norm(name);
    const existing = !consumedNames.has(nameKey) ? clientByNameKey.get(nameKey) : undefined;

    let clientId: string;
    if (existing) {
      consumedNames.add(nameKey);
      matchedExisting++;
      clientId = existing.id;
      const upd: Prisma.ClientUpdateInput = {
        meterNumber,
        meterCurrReading: meterCurrReadingNum,
        meterReadingEstimated,
        consumAddress: consumAddress ?? undefined,
        lastInvoiceStatus: "SENT",
        lastInvoiceGrandTotal: grandTotal,
        lastInvoiceSectorNr: sectorNr,
        lastInvoiceIssueDate: issueDate,
      };
      if (existing.portalActivatedAt) {
        preservedActivated++;
      } else if (meterSeries && meterSeries !== existing.meterSeries) {
        upd.meterSeries = meterSeries;
        if (existing.meterSeries) usedMeterSeries.delete(existing.meterSeries);
        usedMeterSeries.add(meterSeries);
      }
      clientUpdates.push({ id: existing.id, data: upd });
    } else {
      createdNew++;
      clientId = oid();
      if (meterSeries) usedMeterSeries.add(meterSeries);
      clientsToCreate.push({
        id: clientId,
        userId: ctx.ownerId,
        name,
        phone,
        meterSeries,
        meterNumber,
        meterCurrReading: meterCurrReadingNum,
        meterReadingEstimated,
        consumAddress,
        lastInvoiceStatus: "SENT",
        lastInvoiceGrandTotal: grandTotal,
        lastInvoiceSectorNr: sectorNr,
        lastInvoiceIssueDate: issueDate,
        apaCanalImport: !meterSeries,
      });
      clientByNameKey.set(nameKey, { id: clientId, name, meterSeries, portalActivatedAt: null });
      consumedNames.add(nameKey);
    }

    const number = contPersonalRaw ? `AC-${contPersonalRaw}` : `AC-${uid.slice(0, 8)}`;
    if (existingInvoiceNumbers.has(number)) { skippedExistingInvoice++; continue; }
    existingInvoiceNumbers.add(number);

    const invoiceId = oid();
    invoicesToCreate.push({
      id: invoiceId,
      number,
      status: "SENT",
      kind: "APA_CANAL",
      issueDate,
      contPersonal: contPersonalRaw || null,
      sectorNr,
      consumAddress,
      consumerName: name,
      meterNumber,
      meterPrevReading: reading ? pad5(reading.prev) : null,
      meterCurrReading: reading ? pad5(reading.curr) : null,
      isEstimatedVolume: meterReadingEstimated,
      billingPeriodLabel: `${LUNI_RO[issueDate.getUTCMonth()]} ${issueDate.getUTCFullYear()}`,
      recalculari: 0,
      penalitati: 0,
      datoriiAvans,
      monthlyConsumption: reading
        ? [{ label: String(issueDate.getUTCMonth() + 1), value: round2(reading.total) }]
        : [],
      clientId,
      currency: "MDL",
      subtotal,
      taxTotal: 0,
      grandTotal,
      publicToken: genToken(),
      userId: ctx.ownerId,
    });

    items.forEach((it, idx) => {
      const qty = Number(it["Показания"]) || 0;
      const price = Number(it["Цена"]) || 0;
      const lineTotal = round2(it["Сумма"]);
      itemsToCreate.push({
        id: oid(),
        invoiceId,
        description: SERVICE_RO[str(it["ТипУслуги"])] ?? (str(it["ТипУслуги"]) || "Serviciu"),
        quantity: qty,
        unitPrice: price,
        taxRate: 0,
        lineSubtotal: lineTotal,
        lineTotal,
        position: idx,
      });
    });
  }

  const totalNecuvenit = round2(invoicesToCreate.reduce((s, i) => s + (i.subtotal as number), 0));
  const totalDePlata = round2(invoicesToCreate.reduce((s, i) => s + (i.grandTotal as number), 0));

  return {
    clientsToCreate,
    clientUpdates,
    invoicesToCreate,
    itemsToCreate,
    stats: {
      documenteTotale: docByUid.size,
      sariteFaraAbonent: skippedNoDoc,
      clientiNoiDeCreat: clientsToCreate.length,
      clientiExistentiActualizati: clientUpdates.length,
      dinCareCuContActivatPastrat: preservedActivated,
      coliziuniContPersonal: meterSeriesCollisions,
      facturiDeCreat: invoicesToCreate.length,
      facturiSaritePreexistente: skippedExistingInvoice,
      liniiFacturaDeCreat: itemsToCreate.length,
      totalNecuvenit,
      totalDePlata,
    },
  };
}

const CHUNK = 1000;

async function chunkedCreateMany<T>(
  createMany: (args: { data: T[] }) => Promise<{ count: number }>,
  rows: T[],
): Promise<number> {
  let created = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await createMany({ data: rows.slice(i, i + CHUNK) });
    created += res.count;
  }
  return created;
}

export type ApaCanalApplyResult = {
  clientsCreated: number;
  clientsUpdated: number;
  invoicesCreated: number;
  itemsCreated: number;
};

// Interfață minimală, scrisă de mână (NU derivată din PrismaClient) — clientul din
// lib/prisma.ts e rezultatul unui $extends() ale cărui delegate-uri au un tip generic intern
// diferit de PrismaClient brut și nu se potrivesc structural cu Pick<PrismaClient, ...>, deși
// la runtime metodele chemate aici (createMany/update) au exact aceeași semnătură funcțională.
type ApaCanalPrisma = {
  client: {
    createMany(args: { data: Prisma.ClientCreateManyInput[] }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: Prisma.ClientUpdateInput }): Promise<unknown>;
  };
  invoice: {
    createMany(args: { data: Prisma.InvoiceCreateManyInput[] }): Promise<{ count: number }>;
  };
  invoiceItem: {
    createMany(args: { data: Prisma.InvoiceItemCreateManyInput[] }): Promise<{ count: number }>;
  };
};

/** Scrie planul efectiv în bază (batch-uit — vezi scripts/import-apa-canal-cahul-april2024.mjs). */
export async function applyApaCanalPlan(
  prisma: ApaCanalPrisma,
  plan: ApaCanalPlan,
): Promise<ApaCanalApplyResult> {
  const clientsCreated = await chunkedCreateMany(
    (args) => prisma.client.createMany(args),
    plan.clientsToCreate,
  );

  let clientsUpdated = 0;
  for (let i = 0; i < plan.clientUpdates.length; i += 50) {
    const slice = plan.clientUpdates.slice(i, i + 50);
    await Promise.all(
      slice.map((u) => prisma.client.update({ where: { id: u.id }, data: u.data }).catch(() => {})),
    );
    clientsUpdated += slice.length;
  }

  const invoicesCreated = await chunkedCreateMany(
    (args) => prisma.invoice.createMany(args),
    plan.invoicesToCreate,
  );
  const itemsCreated = await chunkedCreateMany(
    (args) => prisma.invoiceItem.createMany(args),
    plan.itemsToCreate,
  );

  return { clientsCreated, clientsUpdated, invoicesCreated, itemsCreated };
}
