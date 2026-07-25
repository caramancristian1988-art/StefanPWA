// Suprascrieri poziție/mărime pentru editorul vizual al facturii Apă-Canal.
// Fiecare element de pe factură poate fi mutat/redimensionat liber (px<->mm, react-rnd) și,
// dacă e text, poate avea și mărime font + bold suprascrise.

export type ApaCanalElementKey =
  | "title"
  | "titleLine"
  | "datesBlock"
  | "contPersonalBlock"
  | "logo"
  | "chart"
  | "meterTable"
  | "companyInfoText"
  | "billingPeriodText"
  | "servicesTable"
  | "recalculariText"
  | "totalsConnectorLine"
  | "totalsBox"
  | "atentieBox"
  | "anuntBox"
  | "contacteBlock"
  | "scanQrBlock";

export type ApaCanalElementOverride = {
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  fontSizeMm?: number;
  bold?: boolean;
};

export type ApaCanalLayout = Partial<Record<ApaCanalElementKey, ApaCanalElementOverride>>;

export const APA_CANAL_ELEMENT_LABELS: Record<ApaCanalElementKey, string> = {
  title: "Titlu factură",
  titleLine: "Linia de sub titlu",
  datesBlock: "Data emiterii / limită",
  contPersonalBlock: "Cont personal / adresă / nume",
  logo: "Logo",
  chart: "Grafic consum",
  meterTable: "Tabel contor",
  companyInfoText: "Text companie (adresă/email/nume/cod fiscal)",
  billingPeriodText: "Perioada de calcul",
  servicesTable: "Tabel servicii",
  recalculariText: "Text Recalculări/Penalitate",
  totalsConnectorLine: "Linia spre caseta de total",
  totalsBox: "Caseta de total",
  atentieBox: "Casetă „Atenție”",
  anuntBox: "Casetă „Anunț”",
  contacteBlock: "Bloc Contacte",
  scanQrBlock: "Bloc „Scanează și achită”",
};

/** Elemente care au și mărime font + bold editabile (pe lângă poziție/mărime). */
export const APA_CANAL_TEXT_KEYS: ApaCanalElementKey[] = [
  "title",
  "datesBlock",
  "contPersonalBlock",
  "companyInfoText",
  "meterTable",
  "billingPeriodText",
  "servicesTable",
  "recalculariText",
  "totalsBox",
  "atentieBox",
  "anuntBox",
  "contacteBlock",
];

/** Poziții/mărimi implicite (mm), folosite doar ca punct de plecare în editor înainte de prima ajustare. */
export const APA_CANAL_LAYOUT_DEFAULTS: Record<ApaCanalElementKey, Required<Pick<ApaCanalElementOverride, "xMm" | "yMm" | "widthMm" | "heightMm">>> = {
  title: { xMm: 5, yMm: 5, widthMm: 200, heightMm: 8 },
  titleLine: { xMm: 5, yMm: 12, widthMm: 210, heightMm: 3 },
  datesBlock: { xMm: 5, yMm: 16, widthMm: 150, heightMm: 12 },
  contPersonalBlock: { xMm: 165, yMm: 16, widthMm: 50, heightMm: 24 },
  logo: { xMm: 220, yMm: 5, widthMm: 70, heightMm: 40 },
  chart: { xMm: 5, yMm: 32, widthMm: 150, heightMm: 50 },
  meterTable: { xMm: 165, yMm: 40, widthMm: 55, heightMm: 18 },
  companyInfoText: { xMm: 220, yMm: 48, widthMm: 70, heightMm: 26 },
  billingPeriodText: { xMm: 5, yMm: 88, widthMm: 150, heightMm: 6 },
  servicesTable: { xMm: 5, yMm: 95, widthMm: 150, heightMm: 18 },
  recalculariText: { xMm: 5, yMm: 118, widthMm: 35, heightMm: 12 },
  totalsConnectorLine: { xMm: 45, yMm: 127, widthMm: 75, heightMm: 3 },
  totalsBox: { xMm: 125, yMm: 115, widthMm: 58, heightMm: 20 },
  atentieBox: { xMm: 5, yMm: 138, widthMm: 150, heightMm: 35 },
  anuntBox: { xMm: 220, yMm: 78, widthMm: 70, heightMm: 35 },
  contacteBlock: { xMm: 220, yMm: 118, widthMm: 70, heightMm: 40 },
  scanQrBlock: { xMm: 220, yMm: 162, widthMm: 70, heightMm: 30 },
};

export const MM_TO_PX = 96 / 25.4;

export const round1 = (n: number) => Math.round(n * 10) / 10;
