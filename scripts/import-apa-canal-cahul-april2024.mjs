// Import one-off: public/AcCahul_Date_tabel1.txt — export complet din sistemul 1C al S.A.
// Apă-Canal Cahul pentru perioada Aprilie 2024 (18.261 abonați). Fișierul e JSON codificat
// Windows-1251, cu 6 tabele legate prin UID: Документы (sold/factură curentă), Абоненты
// (nume/contract/cont personal), Потребители (zonă/sector), ИзмерительныеПриборы (contor),
// Потребления (citiri) și РасчетСумм (linii de facturare apă/canal).
//
// Pentru fiecare UID: potrivește/actualizează un Client (după nume, owner Gheorghe) și
// generează o factură APA_CANAL cu liniile reale de consum. "Cont personal" (Лицевой счет,
// prezent la 97% din abonați, unic) devine noul Client.meterSeries — înlocuiește placeholderul
// aleator din import-apa-canal-clients.mjs / numărul secvențial din import-axioma-water-meters.mjs
// — EXCEPTÂND clienții care și-au activat deja contul din portal (le păstrăm codul de login).
//
// Rulare: node scripts/import-apa-canal-cahul-april2024.mjs --dry-run   (raport, nu scrie nimic)
//         node scripts/import-apa-canal-cahul-april2024.mjs --commit    (scrie efectiv în bază)
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import iconv from "iconv-lite";
import { ObjectId } from "mongodb";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SRC = "public/AcCahul_Date_tabel1.txt";
const OWNER_EMAIL = "caramangheorghe7b@gmail.com";
const CHUNK = 1000;

const LUNI_RO = [
  "IANUARIE", "FEBRUARIE", "MARTIE", "APRILIE", "MAI", "IUNIE",
  "IULIE", "AUGUST", "SEPTEMBRIE", "OCTOMBRIE", "NOIEMBRIE", "DECEMBRIE",
];

const SERVICE_RO = {
  "Потребление воды": "Serviciul de alimentare cu apă",
  "Сброс канализации": "Serviciul de canalizare",
};

const SECTOR_RO = {
  "Частный": "Sector privat",
  "Коммунальный": "Sector comunal",
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const oid = () => new ObjectId().toHexString();
const genToken = () => randomBytes(18).toString("base64url");
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const pad5 = (n) => {
  const s = String(Math.trunc(Number(n) || 0));
  return s.length < 5 ? s.padStart(5, "0") : s;
};

function readJson() {
  const buf = fs.readFileSync(SRC);
  const text = iconv.decode(buf, "win1251");
  return JSON.parse(text);
}

function main_dry_run_flag() {
  return process.argv.includes("--dry-run") || !process.argv.includes("--commit");
}

async function chunkedCreateMany(model, rows, label) {
  let created = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const res = await model.createMany({ data: slice });
    created += res.count;
    process.stdout.write(`\r  ${label}: ${Math.min(i + CHUNK, rows.length)}/${rows.length} (creați: ${created})`);
  }
  console.log();
  return created;
}

async function main() {
  const dryRun = main_dry_run_flag();
  console.log(dryRun ? "=== DRY RUN (nu se scrie nimic) ===" : "=== COMMIT (se scrie în baza de date) ===");

  console.log("Citesc și decodez", SRC, "...");
  const data = readJson();

  const documente = data["Документы"] ?? [];
  const abonenti = data["Абоненты"] ?? [];
  const potребители = data["Потребители"] ?? [];
  const contoare = data["ИзмерительныеПриборы"] ?? [];
  const potребления = data["Потребления"] ?? [];
  const calculeSume = data["РасчетСумм"] ?? [];
  console.log({
    documente: documente.length,
    abonenti: abonenti.length,
    potребители: potребители.length,
    contoare: contoare.length,
    potребления: potребления.length,
    calculeSume: calculeSume.length,
  });

  // ─── Indexare pe UID ────────────────────────────────────────────────────
  const docByUid = new Map(documente.map((d) => [d.UID, d]));
  const subByUid = new Map(abonenti.map((a) => [a.UID, a]));

  const consumerByUid = new Map();
  for (const c of potребители) {
    const prev = consumerByUid.get(c.UID);
    if (!prev || String(c["Период"]) > String(prev["Период"])) consumerByUid.set(c.UID, c);
  }

  const meterByUid = new Map();
  for (const m of contoare) {
    const prev = meterByUid.get(m.UID);
    // preferă contorul activ (fără dată de demontare) și, între active, pe cel instalat mai recent
    const active = !m["ДатаСнятия"] || m["ДатаСнятия"].startsWith("0001-01-01");
    if (!prev) { meterByUid.set(m.UID, m); continue; }
    const prevActive = !prev["ДатаСнятия"] || prev["ДатаСнятия"].startsWith("0001-01-01");
    if (active && !prevActive) { meterByUid.set(m.UID, m); continue; }
    if (active === prevActive && String(m["ДатаУстановки"]) > String(prev["ДатаУстановки"])) {
      meterByUid.set(m.UID, m);
    }
  }

  // Potrebления: pot fi mai multe (mai multe contoare) pe același UID — agregăm.
  const readingByUid = new Map(); // UID -> { prev, curr, total, dataPokazanii, estimat }
  for (const r of potребления) {
    const agg = readingByUid.get(r.UID) ?? {
      prev: 0, curr: 0, total: 0, dataPokazanii: "", estimat: false, count: 0,
    };
    agg.total += Number(r["ИтогПотребления"]) || 0;
    agg.count += 1;
    if (String(r["ДатаПоказаний"]) >= agg.dataPokazanii) {
      agg.dataPokazanii = String(r["ДатаПоказаний"]);
      agg.prev = Number(r["ПредыдущиеПоказания"]) || 0;
      agg.curr = Number(r["Показания"]) || 0;
    }
    if (String(r["Источник"] ?? "") !== "Контролер") agg.estimat = true;
    readingByUid.set(r.UID, agg);
  }

  const itemsByUid = new Map();
  for (const it of calculeSume) {
    const arr = itemsByUid.get(it.UID) ?? [];
    arr.push(it);
    itemsByUid.set(it.UID, arr);
  }

  // ─── Owner + clienți existenți ──────────────────────────────────────────
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner) throw new Error(`Nu găsesc contul owner: ${OWNER_EMAIL}`);

  const existingClients = await prisma.client.findMany({
    where: { userId: owner.id },
    select: { id: true, name: true, meterSeries: true, portalActivatedAt: true },
  });
  const clientByNameKey = new Map(existingClients.map((c) => [norm(c.name), c]));
  const usedMeterSeries = new Set(existingClients.map((c) => c.meterSeries).filter(Boolean));
  const consumedNames = new Set(); // evită potrivirea aceluiași client existent la 2 UID-uri diferite

  const existingInvoiceNumbers = new Set(
    (await prisma.invoice.findMany({ select: { number: true } })).map((i) => i.number),
  );

  // ─── Construiește planul: clienți de creat, clienți de actualizat, facturi de creat ──
  const clientsToCreate = [];
  const clientUpdates = []; // { id, data }
  const invoicesToCreate = [];
  const itemsToCreate = [];

  let skippedNoDoc = 0;
  let meterSeriesCollisions = 0;
  let preservedActivated = 0;
  let matchedExisting = 0;
  let createdNew = 0;
  let skippedExistingInvoice = 0;

  for (const [uid, doc] of docByUid) {
    const sub = subByUid.get(uid);
    if (!sub) { skippedNoDoc++; continue; }

    const name = String(sub["Наименование"] ?? "").trim();
    if (!name) { skippedNoDoc++; continue; }

    const consumer = consumerByUid.get(uid);
    const meter = meterByUid.get(uid);
    const reading = readingByUid.get(uid);
    const items = itemsByUid.get(uid) ?? [];

    const contPersonalRaw = String(sub["ЛицевойСчет"] ?? "").trim();
    const phone = String(sub["Телефон"] ?? "").trim() || null;
    const consumAddress = [
      String(sub["Город"] ?? "").trim(),
      String(sub["Улица"] ?? "").trim() ? `str. ${String(sub["Улица"]).trim()}` : "",
      String(sub["Дом"] ?? "").trim() ? `nr. ${String(sub["Дом"]).trim()}` : "",
      String(sub["Квартира"] ?? "").trim() ? `ap. ${String(sub["Квартира"]).trim()}` : "",
    ].filter(Boolean).join(", ") || null;
    const sectorRaw = String(sub["ТипСектора"] ?? "").trim() || String(consumer?.["Участок"] ?? "").trim();
    const sectorNr = sectorRaw ? (SECTOR_RO[sectorRaw] ?? sectorRaw) : null;
    const meterNumber = meter ? String(meter["ИзмерительныйПрибор"] ?? "").trim() || null : null;
    const meterCurrReadingNum = reading ? reading.curr : null;
    const meterReadingEstimated = reading ? reading.estimat : false;

    // Serie contor (login portal) = Cont personal, dacă nu e deja folosită de alt client.
    let meterSeries = null;
    if (contPersonalRaw) {
      if (!usedMeterSeries.has(contPersonalRaw)) {
        meterSeries = contPersonalRaw;
      } else {
        meterSeriesCollisions++;
      }
    }

    // Potrivește client existent după nume
    const nameKey = norm(name);
    const existing = !consumedNames.has(nameKey) ? clientByNameKey.get(nameKey) : undefined;

    let clientId;
    if (existing) {
      consumedNames.add(nameKey);
      matchedExisting++;
      clientId = existing.id;
      const upd = {
        meterNumber,
        meterCurrReading: meterCurrReadingNum,
        meterReadingEstimated,
        consumAddress: consumAddress ?? undefined,
      };
      if (existing.portalActivatedAt) {
        preservedActivated++; // nu atingem meterSeries — contul e deja activat cu codul vechi
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
        userId: owner.id,
        name,
        phone,
        meterSeries,
        meterNumber,
        meterCurrReading: meterCurrReadingNum,
        meterReadingEstimated,
        consumAddress,
      });
      clientByNameKey.set(nameKey, { id: clientId, name, meterSeries, portalActivatedAt: null });
      consumedNames.add(nameKey);
    }

    // ─── Factura APA_CANAL ──────────────────────────────────────────────
    const number = contPersonalRaw ? `AC-${contPersonalRaw}` : `AC-${uid.slice(0, 8)}`;
    if (existingInvoiceNumbers.has(number)) { skippedExistingInvoice++; continue; }
    existingInvoiceNumbers.add(number);

    const issueDate = new Date(doc["Дата"]);
    const subtotal = round2(Number(doc["Начислено"]) || 0);
    const datoriiAvans = round2(Number(doc["ОплаченоДолг"]) || 0);
    const grandTotal = round2(subtotal + datoriiAvans);

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
      monthlyConsumption: reading ? [{ label: String(issueDate.getUTCMonth() + 1), value: round2(reading.total) }] : [],
      clientId,
      notes: null,
      terms: null,
      currency: "MDL",
      subtotal,
      taxTotal: 0,
      grandTotal,
      publicToken: genToken(),
      userId: owner.id,
    });

    items.forEach((it, idx) => {
      const qty = Number(it["Показания"]) || 0;
      const price = Number(it["Цена"]) || 0;
      const lineTotal = round2(Number(it["Сумма"]) || 0);
      itemsToCreate.push({
        id: oid(),
        invoiceId,
        description: SERVICE_RO[it["ТипУслуги"]] ?? String(it["ТипУслуги"] ?? "Serviciu"),
        quantity: qty,
        unitPrice: price,
        taxRate: 0,
        lineSubtotal: lineTotal,
        lineTotal,
        position: idx,
      });
    });
  }

  console.log("\n=== Plan import ===");
  console.log({
    documenteTotale: docByUid.size,
    sariteFaraAbonent: skippedNoDoc,
    clientiNoiDeCreat: clientsToCreate.length,
    clientiExistentiActualizati: clientUpdates.length,
    dinCareCuContActivatPastrat: preservedActivated,
    coliziuniContPersonal: meterSeriesCollisions,
    facturiDeCreat: invoicesToCreate.length,
    facturiSaritePreexistente: skippedExistingInvoice,
    liniiFacturaDeCreat: itemsToCreate.length,
  });

  const totalCharged = round2(invoicesToCreate.reduce((s, i) => s + i.subtotal, 0));
  const totalDue = round2(invoicesToCreate.reduce((s, i) => s + i.grandTotal, 0));
  console.log({ totalNecuvenit_Начислено: totalCharged, totalDePlata_SumaKOplate: totalDue });

  if (dryRun) {
    console.log("\nDry-run — nimic nu a fost scris. Rulează cu --commit pentru a scrie efectiv.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nScriu clienți noi...");
  await chunkedCreateMany(prisma.client, clientsToCreate, "Clienți noi");

  console.log("Actualizez clienți existenți...");
  let updated = 0;
  for (let i = 0; i < clientUpdates.length; i += 50) {
    const slice = clientUpdates.slice(i, i + 50);
    await Promise.all(slice.map((u) => prisma.client.update({ where: { id: u.id }, data: u.data }).catch((e) => {
      console.error(`\n  eroare update client ${u.id}:`, e.message);
    })));
    updated += slice.length;
    process.stdout.write(`\r  Clienți actualizați: ${updated}/${clientUpdates.length}`);
  }
  console.log();

  console.log("Scriu facturi...");
  await chunkedCreateMany(prisma.invoice, invoicesToCreate, "Facturi");

  console.log("Scriu linii de factură...");
  await chunkedCreateMany(prisma.invoiceItem, itemsToCreate, "Linii factură");

  console.log("\nGata.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
