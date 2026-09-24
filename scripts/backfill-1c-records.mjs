// Umple colecția OneCRecord ("Tabelul 1C") din exportul 1C — un rând per UID, cu toate datele
// combinate din cele 6 tabele. NU atinge Client / Invoice: scrie doar în OneCRecord.
//
// Rulare: node scripts/backfill-1c-records.mjs "<calea către AcCahul_Date_tabel1.txt>"            (raport)
//         node scripts/backfill-1c-records.mjs "<calea>" --commit                                (scrie)
// Re-rularea înlocuiește complet colecția (delete + insert) — e idempotentă.
import fs from "node:fs";
import iconv from "iconv-lite";
import { PrismaClient } from "@prisma/client";
import { buildOneCRecords } from "../lib/apa-canal-1c.ts";

const file = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const commit = process.argv.includes("--commit");
if (!file) {
  console.error('Utilizare: node scripts/backfill-1c-records.mjs "<fișier 1C .txt/.json>" [--commit]');
  process.exit(1);
}

function parse(buf) {
  const utf8 = buf.toString("utf-8");
  if (!utf8.includes("�")) {
    try { return JSON.parse(utf8); } catch { /* cade pe win1251 */ }
  }
  return JSON.parse(iconv.decode(buf, "win1251"));
}

const obj = parse(fs.readFileSync(file));
const data = {
  documente: obj["Документы"] ?? [],
  abonenti: obj["Абоненты"] ?? [],
  consumatori: obj["Потребители"] ?? [],
  contoare: obj["ИзмерительныеПриборы"] ?? [],
  citiri: obj["Потребления"] ?? [],
  calculeSume: obj["РасчетСумм"] ?? [],
};
if (!data.documente.length || !data.abonenti.length) throw new Error("Fișierul nu pare exportul 1C Apă-Canal.");

const records = buildOneCRecords(data);
console.log(`Abonați în fișier: ${data.abonenti.length} → înregistrări: ${records.length}`);
console.log(`Rânduri-detaliu: consumatori ${records.reduce((s, r) => s + r.consumers.length, 0)}/${data.consumatori.length}, ` +
  `contoare ${records.reduce((s, r) => s + r.meters.length, 0)}/${data.contoare.length}, ` +
  `citiri ${records.reduce((s, r) => s + r.readings.length, 0)}/${data.citiri.length}, ` +
  `linii ${records.reduce((s, r) => s + r.lines.length, 0)}/${data.calculeSume.length}`);

const prisma = new PrismaClient();
try {
  const invs = await prisma.invoice.findMany({ where: { kind: "APA_CANAL" }, select: { number: true, clientId: true } });
  const clientByNumber = new Map(invs.map((i) => [i.number, i.clientId]));
  let linked = 0;
  for (const r of records) {
    r.clientId = clientByNumber.get(r.invoiceNumber) ?? null;
    if (r.clientId) linked++;
  }
  console.log(`Legate de un client/factură din PWA: ${linked}/${records.length}`);

  if (!commit) {
    console.log("\n(raport — nu s-a scris nimic; adaugă --commit ca să scrii)");
  } else {
    const removed = await prisma.oneCRecord.deleteMany({});
    console.log(`Șterse ${removed.count} înregistrări vechi.`);
    const CHUNK = 500;
    for (let i = 0; i < records.length; i += CHUNK) {
      await prisma.oneCRecord.createMany({ data: records.slice(i, i + CHUNK) });
      process.stdout.write(`\r  inserate ${Math.min(i + CHUNK, records.length)}/${records.length}`);
    }
    console.log();
    // Indexuri (prisma db push nu poate rula pe baza asta — ar încerca și un index unic pe
    // Client.meterSeries, imposibil cu clienții fără cont personal).
    await prisma.$runCommandRaw({
      createIndexes: "OneCRecord",
      indexes: [
        { key: { uid: 1 }, name: "OneCRecord_uid_key", unique: true },
        { key: { contPersonal: 1 }, name: "OneCRecord_contPersonal_idx" },
        { key: { nume: 1 }, name: "OneCRecord_nume_idx" },
        { key: { invoiceNumber: 1 }, name: "OneCRecord_invoiceNumber_idx" },
        { key: { clientId: 1 }, name: "OneCRecord_clientId_idx" },
      ],
    });
    console.log("Indexuri create. Total în bază:", await prisma.oneCRecord.count());
  }
} finally {
  await prisma.$disconnect();
}
