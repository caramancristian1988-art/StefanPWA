/**
 * "Tabelul 1C": exportul 1C (6 tabele legate prin UID) combinat într-un singur rând per UID, cu
 * TOATE datele din fișier — ca cei de la 1C să poată verifica singuri, într-un tabel filtrabil, că
 * ce e în PWA corespunde cu ce au exportat ei.
 *
 * Modul pur (fără server-only / alias-uri) — îl folosește și scriptul de backfill (rulat direct cu
 * node), nu doar aplicația. De-aia nu importă nimic în afară de tipuri.
 */

export type ColType = "text" | "num" | "date";

export type OneCColumn = {
  key: string;
  label: string;
  /** Numele câmpului din JSON-ul 1C (pentru cei de la 1C, ca să recunoască sursa). */
  src: string;
  type: ColType;
  /** Lățime orientativă (px) în tabel. */
  w: number;
};

/** Coloanele tabelului comun, în ordinea afișării. `key` = câmpul din modelul OneCRecord. */
export const ONEC_COLUMNS: OneCColumn[] = [
  { key: "uid", label: "UID", src: "UID", type: "text", w: 250 },
  { key: "nume", label: "Abonat", src: "Абоненты.Наименование", type: "text", w: 220 },
  { key: "nrContract", label: "Nr. contract", src: "Абоненты.НомерДоговора", type: "text", w: 100 },
  { key: "contPersonal", label: "Cont personal", src: "Абоненты.ЛицевойСчет", type: "text", w: 110 },
  { key: "tipSector", label: "Tip sector", src: "Абоненты.ТипСектора", type: "text", w: 120 },
  { key: "telefon", label: "Telefon", src: "Абоненты.Телефон", type: "text", w: 120 },
  { key: "oras", label: "Oraș", src: "Абоненты.Город", type: "text", w: 110 },
  { key: "strada", label: "Stradă", src: "Абоненты.Улица", type: "text", w: 160 },
  { key: "casa", label: "Casa", src: "Абоненты.Дом", type: "text", w: 70 },
  { key: "apartament", label: "Apartament", src: "Абоненты.Квартира", type: "text", w: 90 },
  { key: "dataDoc", label: "Data document", src: "Документы.Дата", type: "date", w: 110 },
  { key: "calculat", label: "Calculat", src: "Документы.Начислено", type: "num", w: 100 },
  { key: "datorieAvans", label: "Datorie / avans", src: "Документы.ОплаченоДолг", type: "num", w: 110 },
  { key: "deAchitat", label: "De achitat", src: "Документы.СуммаКОплате", type: "num", w: 100 },
  { key: "consumatori", label: "Consumatori", src: "Потребители.Наименование", type: "text", w: 220 },
  { key: "nrConsumatori", label: "Nr. rânduri consumatori", src: "Потребители (nr.)", type: "num", w: 90 },
  { key: "inn", label: "IDNO / ИНН", src: "Потребители.ИНН", type: "text", w: 120 },
  { key: "zonaPresiune", label: "Zonă presiune apă", src: "Потребители.ЗонаДавленияВоды", type: "text", w: 120 },
  { key: "sectorUchastok", label: "Sector (Участок)", src: "Потребители.Участок", type: "text", w: 150 },
  { key: "nrPersoane", label: "Nr. consumatori (pers.)", src: "Потребители.КоличествоПотребителей", type: "num", w: 100 },
  { key: "suprafata", label: "Suprafață", src: "Потребители.ПлощадьУчастка", type: "num", w: 90 },
  { key: "inceputConsum", label: "Început consum", src: "Потребители.НачалоПотребления", type: "date", w: 110 },
  { key: "sfarsitConsum", label: "Sfârșit consum", src: "Потребители.ОкончаниеПотребления", type: "date", w: 110 },
  { key: "nrContoare", label: "Nr. contoare", src: "ИзмерительныеПриборы (nr.)", type: "num", w: 90 },
  { key: "contorActiv", label: "Contor activ", src: "ИзмерительныеПриборы.ИзмерительныйПрибор", type: "text", w: 110 },
  { key: "dataInstalare", label: "Data instalării", src: "ИзмерительныеПриборы.ДатаУстановки", type: "date", w: 110 },
  { key: "sigiliu", label: "Nr. sigiliu", src: "ИзмерительныеПриборы.НомерУстановочнойПломбы", type: "text", w: 100 },
  { key: "dataScoatere", label: "Data scoaterii", src: "ИзмерительныеПриборы.ДатаСнятия", type: "date", w: 110 },
  { key: "citirePrec", label: "Citire anterioară", src: "Потребления.ПредыдущиеПоказания", type: "num", w: 100 },
  { key: "dataCitirePrec", label: "Data citirii ant.", src: "Потребления.ДатаПредыдущихПоказаний", type: "date", w: 110 },
  { key: "citireCurenta", label: "Citire curentă", src: "Потребления.Показания", type: "num", w: 100 },
  { key: "dataCitire", label: "Data citirii", src: "Потребления.ДатаПоказаний", type: "date", w: 110 },
  { key: "consumTotal", label: "Consum total", src: "Потребления.ИтогПотребления", type: "num", w: 100 },
  { key: "sursaCitire", label: "Sursa citirii", src: "Потребления.Источник", type: "text", w: 110 },
  { key: "apaVolum", label: "Apă: volum", src: "РасчетСумм.Показания (воды)", type: "num", w: 90 },
  { key: "apaTarif", label: "Apă: tarif", src: "РасчетСумм.Цена (воды)", type: "num", w: 90 },
  { key: "apaSuma", label: "Apă: sumă", src: "РасчетСумм.Сумма (воды)", type: "num", w: 90 },
  { key: "canalVolum", label: "Canal: volum", src: "РасчетСумм.Показания (канализации)", type: "num", w: 90 },
  { key: "canalTarif", label: "Canal: tarif", src: "РасчетСумм.Цена (канализации)", type: "num", w: 90 },
  { key: "canalSuma", label: "Canal: sumă", src: "РасчетСумм.Сумма (канализации)", type: "num", w: 90 },
];

export const ONEC_COLUMN_KEYS = ONEC_COLUMNS.map((c) => c.key);

/** Detalii (rânduri brute din tabelele-copil, legate prin UID) — păstrate ca JSON pe înregistrare. */
export type OneCConsumer = {
  perioada: string | null; nume: string; inn: string; inceput: string | null; sfarsit: string | null;
  zona: string; sector: string; nrPersoane: number; suprafata: number;
};
export type OneCMeter = {
  perioada: string | null; consumator: string; inn: string; contor: string; dataInstalare: string | null;
  sigiliu: string; dataScoatere: string | null; subAbonat: string; subContract: string; subCont: string;
  subConsumator: string; subContor: string;
};
export type OneCReading = {
  consumator: string; inn: string; contor: string; sursa: string; citirePrec: number; dataPrec: string | null;
  citire: number; dataCitire: string | null; consum: number; medie: number; consumSubcontoare: number;
};
export type OneCLine = {
  consumator: string; inn: string; contor: string; serviciu: string; volum: number; tarif: number; suma: number;
  data: string | null;
};

export type OneCRecordData = {
  uid: string;
  nume: string;
  nrContract: string | null;
  contPersonal: string | null;
  tipSector: string | null;
  telefon: string | null;
  oras: string | null;
  strada: string | null;
  casa: string | null;
  apartament: string | null;
  dataDoc: string | null;
  calculat: number | null;
  datorieAvans: number | null;
  deAchitat: number | null;
  consumatori: string | null;
  nrConsumatori: number;
  inn: string | null;
  zonaPresiune: string | null;
  sectorUchastok: string | null;
  nrPersoane: number | null;
  suprafata: number | null;
  inceputConsum: string | null;
  sfarsitConsum: string | null;
  nrContoare: number;
  contorActiv: string | null;
  dataInstalare: string | null;
  sigiliu: string | null;
  dataScoatere: string | null;
  citirePrec: number | null;
  dataCitirePrec: string | null;
  citireCurenta: number | null;
  dataCitire: string | null;
  consumTotal: number | null;
  sursaCitire: string | null;
  apaVolum: number | null;
  apaTarif: number | null;
  apaSuma: number | null;
  canalVolum: number | null;
  canalTarif: number | null;
  canalSuma: number | null;
  invoiceNumber: string | null;
  consumers: OneCConsumer[];
  meters: OneCMeter[];
  readings: OneCReading[];
  lines: OneCLine[];
};

type Raw = Record<string, unknown>;
export type OneCRawData = {
  documente: Raw[];
  abonenti: Raw[];
  consumatori: Raw[];
  contoare: Raw[];
  citiri: Raw[];
  calculeSume: Raw[];
};

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (v: unknown): string | null => {
  const s = str(v);
  if (!s || s.startsWith("0001-01-01")) return null;
  return s.slice(0, 10);
};
const distinct = (a: string[]) => [...new Set(a.filter(Boolean))];
const joined = (a: string[]) => {
  const d = distinct(a);
  return d.length ? d.join(" | ") : null;
};
const nz = (s: string) => (s ? s : null);

const SVC_WATER = "Потребление воды";
const SVC_SEWER = "Сброс канализации";
// Valorile enumerate (tip sector, sursa citirii, tip serviciu) rămân EXACT ca în 1C — tabelul e făcut
// pentru ca ei să-și recunoască datele, nu pentru traducere.

function groupByUid(rows: Raw[]): Map<string, Raw[]> {
  const m = new Map<string, Raw[]>();
  for (const r of rows) {
    const u = str(r.UID);
    const a = m.get(u);
    if (a) a.push(r);
    else m.set(u, [r]);
  }
  return m;
}

/**
 * Un rând per abonat (UID). Valorile "sumar" (ex. contor activ, zonă, citire curentă) urmează
 * aceleași reguli ca la importul facturilor; TOT ce e în fișier rămâne oricum în listele-detaliu
 * (consumers/meters/readings/lines), deci nimic nu se pierde chiar dacă un UID are 52 de consumatori.
 */
export function buildOneCRecords(data: OneCRawData): OneCRecordData[] {
  const docByUid = new Map(data.documente.map((d) => [str(d.UID), d]));
  const consByUid = groupByUid(data.consumatori);
  const meterByUid = groupByUid(data.contoare);
  const readByUid = groupByUid(data.citiri);
  const lineByUid = groupByUid(data.calculeSume);

  const out: OneCRecordData[] = [];
  for (const sub of data.abonenti) {
    const uid = str(sub.UID);
    const doc = docByUid.get(uid);
    const contPersonal = str(sub["ЛицевойСчет"]);

    const consumers: OneCConsumer[] = (consByUid.get(uid) ?? []).map((c) => ({
      perioada: iso(c["Период"]),
      nume: str(c["Наименование"]),
      inn: str(c["ИНН"]),
      inceput: iso(c["НачалоПотребления"]),
      sfarsit: iso(c["ОкончаниеПотребления"]),
      zona: str(c["ЗонаДавленияВоды"]),
      sector: str(c["Участок"]),
      nrPersoane: num(c["КоличествоПотребителей"]),
      suprafata: num(c["ПлощадьУчастка"]),
    }));
    const meters: OneCMeter[] = (meterByUid.get(uid) ?? []).map((m) => ({
      perioada: iso(m["Период"]),
      consumator: str(m["ПодчиненныйПотребительНаименование"]),
      inn: str(m["ПодчиненныйПотребительИНН"]),
      contor: str(m["ИзмерительныйПрибор"]),
      dataInstalare: iso(m["ДатаУстановки"]),
      sigiliu: str(m["НомерУстановочнойПломбы"]),
      dataScoatere: iso(m["ДатаСнятия"]),
      subAbonat: str(m["СубАбонентНаименование"]),
      subContract: str(m["СубАбонентНомерДоговора"]),
      subCont: str(m["СубАбонентЛицевойСчет"]),
      subConsumator: str(m["СубПотребительНаименование"]),
      subContor: str(m["СубПрибор"]),
    }));
    const readings: OneCReading[] = (readByUid.get(uid) ?? []).map((r) => ({
      consumator: str(r["ПодчиненныйПотребительНаименование"]),
      inn: str(r["ПодчиненныйПотребительИНН"]),
      contor: str(r["ИзмерительныйПрибор"]),
      sursa: str(r["Источник"]),
      citirePrec: num(r["ПредыдущиеПоказания"]),
      dataPrec: iso(r["ДатаПредыдущихПоказаний"]),
      citire: num(r["Показания"]),
      dataCitire: iso(r["ДатаПоказаний"]),
      consum: num(r["ИтогПотребления"]),
      medie: num(r["СреднееЗначение"]),
      consumSubcontoare: num(r["ПотреблениеСубводомеры"]),
    }));
    const lines: OneCLine[] = (lineByUid.get(uid) ?? []).map((l) => ({
      consumator: str(l["ПодчиненныйПотребительНаименование"]),
      inn: str(l["ПодчиненныйПотребительИНН"]),
      contor: str(l["ИзмерительныйПрибор"]),
      serviciu: str(l["ТипУслуги"]),
      volum: num(l["Показания"]),
      tarif: num(l["Цена"]),
      suma: num(l["Сумма"]),
      data: iso(l["ДатаПоказаний"]),
    }));

    // Consumatorul "curent" = ultima perioadă.
    const lastCons = [...consumers].sort((a, b) => (b.perioada ?? "").localeCompare(a.perioada ?? ""))[0];

    // Contorul: cel activ (nescos) cu cea mai recentă instalare — ca la importul facturilor.
    const activeMeters = meters.filter((m) => !m.dataScoatere);
    const pool = activeMeters.length ? activeMeters : meters;
    const meter = [...pool].sort((a, b) => (b.dataInstalare ?? "").localeCompare(a.dataInstalare ?? ""))[0];

    // Citirea: cea mai recentă după dată.
    const lastRead = [...readings].sort((a, b) => (b.dataCitire ?? "").localeCompare(a.dataCitire ?? ""))[0];
    const readSources = distinct(readings.map((r) => r.sursa));

    const water = lines.filter((l) => l.serviciu === SVC_WATER);
    const sewer = lines.filter((l) => l.serviciu === SVC_SEWER);
    const sumLines = (a: OneCLine[], k: "volum" | "suma") => (a.length ? round2(a.reduce((s, l) => s + l[k], 0)) : null);
    const lastTarif = (a: OneCLine[]) => {
      const t = [...a].reverse().find((l) => l.tarif);
      return t ? t.tarif : null;
    };

    out.push({
      uid,
      nume: str(sub["Наименование"]),
      nrContract: nz(str(sub["НомерДоговора"])),
      contPersonal: nz(contPersonal),
      tipSector: nz(str(sub["ТипСектора"])),
      telefon: nz(str(sub["Телефон"])),
      oras: nz(str(sub["Город"])),
      strada: nz(str(sub["Улица"])),
      casa: nz(str(sub["Дом"])),
      apartament: nz(str(sub["Квартира"])),
      dataDoc: doc ? iso(doc["Дата"]) : null,
      calculat: doc ? round2(num(doc["Начислено"])) : null,
      datorieAvans: doc ? round2(num(doc["ОплаченоДолг"])) : null,
      deAchitat: doc ? round2(num(doc["СуммаКОплате"])) : null,
      consumatori: joined(consumers.map((c) => c.nume)),
      nrConsumatori: consumers.length,
      inn: joined(consumers.map((c) => c.inn)),
      zonaPresiune: nz(lastCons?.zona ?? ""),
      sectorUchastok: nz(lastCons?.sector ?? ""),
      nrPersoane: lastCons ? lastCons.nrPersoane : null,
      suprafata: lastCons ? lastCons.suprafata : null,
      inceputConsum: lastCons?.inceput ?? null,
      sfarsitConsum: lastCons?.sfarsit ?? null,
      nrContoare: meters.length,
      contorActiv: nz(meter?.contor ?? ""),
      dataInstalare: meter?.dataInstalare ?? null,
      sigiliu: nz(meter?.sigiliu ?? ""),
      dataScoatere: meter?.dataScoatere ?? null,
      citirePrec: lastRead ? lastRead.citirePrec : null,
      dataCitirePrec: lastRead?.dataPrec ?? null,
      citireCurenta: lastRead ? lastRead.citire : null,
      dataCitire: lastRead?.dataCitire ?? null,
      consumTotal: readings.length ? round2(readings.reduce((s, r) => s + r.consum, 0)) : null,
      sursaCitire: readSources.length ? readSources.join(" | ") : null,
      apaVolum: sumLines(water, "volum"),
      apaTarif: lastTarif(water),
      apaSuma: sumLines(water, "suma"),
      canalVolum: sumLines(sewer, "volum"),
      canalTarif: lastTarif(sewer),
      canalSuma: sumLines(sewer, "suma"),
      invoiceNumber: contPersonal ? `AC-${contPersonal}` : `AC-${uid.slice(0, 8)}`,
      consumers,
      meters,
      readings,
      lines,
    });
  }
  return out;
}
